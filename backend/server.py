import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import jwt
from pathlib import Path
from urllib.parse import urlsplit


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes
from lib.auth import COOKIE, JWT_SECRET, seed_defaults
from lib.security_config import auth_is_disabled, cors_origins, is_production, validate_runtime_security
from lib.reminders import reminder_loop
from lib.season import migrate_season_ids
from commercial import routers as commercial_router
from routers import auth as auth_router, loads as loads_router, lab as lab_router, admin as admin_router, extras as extras_router, campaign as campaign_router, tv as tv_router, invoices as invoices_router, client_accounts as client_accounts_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_security()
    # Local-first mode must finish index creation before accepting requests.
    # Keep the existing non-blocking startup behavior for the Render deployment.
    if os.environ.get("SERVE_FRONTEND", "false").strip().lower() in {"1", "true", "yes", "on"}:
        await ensure_indexes()
    else:
        app.state.index_task = asyncio.create_task(ensure_indexes())
    await seed_defaults()
    await migrate_season_ids()
    app.state.reminder_task = asyncio.create_task(reminder_loop())
    try:
        yield
    finally:
        app.state.reminder_task.cancel()
        try:
            await app.state.reminder_task
        except asyncio.CancelledError:
            pass
        client.close()


app = FastAPI(lifespan=lifespan)

# WebSocket clients are kept in memory. Render currently runs this service as one
# instance; use a shared pub/sub broker before scaling the backend horizontally.
active_connections: set[WebSocket] = set()
broadcast_lock = asyncio.Lock()


async def broadcast_data_change(resource: str) -> None:
    payload = {"type": "data_changed", "resource": resource}
    async with broadcast_lock:
        connections = tuple(active_connections)
        results = await asyncio.gather(
            *(connection.send_json(payload) for connection in connections),
            return_exceptions=True,
        )
        for connection, result in zip(connections, results):
            if isinstance(result, Exception):
                active_connections.discard(connection)


@app.websocket("/api/realtime")
async def realtime_updates(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    allowed_origins = cors_origins()
    same_origin_local = os.environ.get("SERVE_FRONTEND", "false").strip().lower() in {"1", "true", "yes", "on"}
    request_host = websocket.headers.get("host", "")
    parsed_origin = urlsplit(origin or "")
    is_same_origin_local = (
        same_origin_local
        and parsed_origin.scheme in {"http", "https"}
        and parsed_origin.netloc == request_host
    )
    if not origin or (origin not in allowed_origins and not is_same_origin_local):
        await websocket.close(code=4403)
        return

    auth_disabled = auth_is_disabled()
    if auth_disabled and is_production():
        await websocket.close(code=4403)
        return
    if not auth_disabled:
        token = websocket.cookies.get(COOKIE)
        if not token:
            await websocket.close(code=4401)
            return
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user = await db.users.find_one(
                {"id": payload.get("sub"), "active": True}, {"_id": 1}
            )
        except jwt.PyJWTError:
            user = None
        if not user:
            await websocket.close(code=4401)
            return

    await websocket.accept()
    active_connections.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.discard(websocket)


@app.middleware("http")
async def notify_other_devices_after_mutations(request, call_next):
    response = await call_next(request)
    if (
        request.url.path.startswith("/api/")
        and request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and response.status_code < 400
        and not request.url.path.startswith("/api/auth/")
    ):
        resource = request.url.path.removeprefix("/api/").split("/", 1)[0]
        await broadcast_data_change(resource or "all")
    return response

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Huilerie API"}


api_router.include_router(auth_router.router)
api_router.include_router(loads_router.router)
api_router.include_router(lab_router.router)
api_router.include_router(admin_router.router)
api_router.include_router(extras_router.router)
api_router.include_router(campaign_router.router)
api_router.include_router(tv_router.router)
api_router.include_router(invoices_router.router)
api_router.include_router(client_accounts_router.router)
api_router.include_router(commercial_router.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Include the router in the main app — keep last
app.include_router(api_router)


# Optional single-origin local Windows deployment. Disabled by default, so the
# existing Render deployment continues to serve its frontend independently.
if os.environ.get("SERVE_FRONTEND", "false").strip().lower() in {"1", "true", "yes", "on"}:
    frontend_dist = ROOT_DIR.parent / "frontend" / "dist"
    frontend_index = frontend_dist / "index.html"
    if not frontend_index.is_file():
        raise RuntimeError(
            f"SERVE_FRONTEND is enabled but the frontend build is missing: {frontend_dist}"
        )

    class SPAStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                # Client-side routes such as /commercial and /factures must
                # load index.html on a direct visit or browser refresh.
                if exc.status_code == 404:
                    return FileResponse(frontend_index)
                raise

    app.mount("/", SPAStaticFiles(directory=str(frontend_dist), html=True), name="frontend")
