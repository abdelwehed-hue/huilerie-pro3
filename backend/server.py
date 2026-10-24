import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, ensure_indexes
from lib.auth import seed_defaults
from lib.reminders import reminder_loop
from lib.season import migrate_season_ids
from routers import auth as auth_router, loads as loads_router, lab as lab_router, admin as admin_router, extras as extras_router, campaign as campaign_router, tv as tv_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await seed_defaults()
    await migrate_season_ids()
    app.state.reminder_task = asyncio.create_task(reminder_loop())
    yield
    app.state.reminder_task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan)

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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
