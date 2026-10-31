"""Public TV screen: today's finished (Terminé) loads — codes + finish time only, never client data.

TV-only display state (hidden number / removed from screen) lives in its own `tv_state`
collection so loads themselves are never modified.
"""

import asyncio
import json
import os
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from lib.db import db
from lib.auth import current_user
from lib.dates import today_iso
from models.schemas import TvAdminItem, TvArrival, TvBoard, TvDisplaySettings, TvItem, TvItemUpdate, TvMediaSettings

router = APIRouter()

def _today_start_utc() -> datetime:
    zone = ZoneInfo(os.environ.get("APP_TZ", "UTC"))
    d = datetime.strptime(today_iso(), "%Y-%m-%d").date()
    return datetime.combine(d, time.min, tzinfo=zone).astimezone(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _finished_today() -> list[tuple[dict, dict]]:
    """(load, tv_state) pairs: oil entered today, not delivered, not cancelled."""
    flt = {
        "oil_kg": {"$ne": None},
        "oil_ready_at": {"$gte": _today_start_utc()},
        "delivered": {"$ne": True},
        "cancelled": {"$ne": True},
    }
    proj = {"_id": 0, "id": 1, "code": 1, "oil_ready_at": 1}
    loads = await db.loads.find(flt, proj).sort("oil_ready_at", -1).to_list(500)
    ids = [l["id"] for l in loads]
    states = {s["load_id"]: s async for s in db.tv_state.find({"load_id": {"$in": ids}}, {"_id": 0})}
    return [(l, states.get(l["id"], {})) for l in loads]


async def build_board() -> TvBoard:
    items = [
        TvItem(id=l["id"], code=None if s.get("hidden") else l["code"], finished_at=_aware(l["oil_ready_at"]))
        for l, s in await _finished_today() if not s.get("removed")
    ]
    day_start = _today_start_utc()
    arrivals_docs = await db.loads.find(
        {"created_at": {"$gte": day_start}, "cancelled": {"$ne": True}},
        {"_id": 0, "id": 1, "code": 1, "created_at": 1},
    ).sort("created_at", -1).limit(100).to_list(100)
    arrivals = [
        TvArrival(id=l["id"], code=l["code"], created_at=_aware(l["created_at"]))
        for l in arrivals_docs
    ]
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, "tv_sound_enabled": 1}) or {}
    return TvBoard(
        today=today_iso(), items=items, arrivals=arrivals,
        sound_enabled=bool(settings.get("tv_sound_enabled", False)),
        server_time=datetime.now(timezone.utc),
    )


@router.get("/tv/media-settings", response_model=TvMediaSettings)
async def get_tv_media_settings(_: dict = Depends(current_user)):
    fields = {name: 1 for name in TvMediaSettings.model_fields}
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, **fields}) or {}
    return TvMediaSettings(**settings)


@router.get("/tv/display-settings", response_model=TvDisplaySettings)
async def get_tv_display_settings():
    # Public TV page needs only its own display media and public mill identity.
    # Do not expose price, login, SMS, or other administrative settings.
    fields = {name: 1 for name in TvDisplaySettings.model_fields}
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, **fields}) or {}
    return TvDisplaySettings(**settings)


@router.put("/tv/media-settings", response_model=TvMediaSettings)
async def put_tv_media_settings(body: TvMediaSettings, _: dict = Depends(current_user)):
    # Dedicated TV-only update: workers can change screen media without gaining access
    # to pricing, login, SMS, or other administrative settings.
    values = body.model_dump()
    await db.settings.update_one({"key": "app"}, {"$set": values}, upsert=True)
    return body


@router.get("/tv/control")
async def get_tv_control(_: dict = Depends(current_user)):
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, "tv_sound_enabled": 1}) or {}
    return {"sound_enabled": bool(settings.get("tv_sound_enabled", False))}


@router.put("/tv/control")
async def set_tv_control(body: dict, _: dict = Depends(current_user)):
    enabled = body.get("sound_enabled")
    if not isinstance(enabled, bool):
        raise HTTPException(400, "invalid_sound_setting")
    await db.settings.update_one(
        {"key": "app"}, {"$set": {"tv_sound_enabled": enabled}}, upsert=True
    )
    return {"sound_enabled": enabled}


@router.get("/tv/board", response_model=TvBoard)
async def tv_board():
    return await build_board()


@router.websocket("/tv/ws")
async def tv_ws(ws: WebSocket):
    """Pushes the board whenever it changes (checked every 2 s). Clients fall back to polling.

    Each connection is closed after ~60 s (clients reconnect at once) so server reloads/shutdowns
    never hang waiting on a long-lived socket.
    """
    await ws.accept()
    last = None
    try:
        for _ in range(30):
            b = await build_board()
            sig = json.dumps({"items": [[i.id, i.code] for i in b.items], "arrivals": [[i.id, i.code] for i in b.arrivals], "sound_enabled": b.sound_enabled})
            if sig != last:
                last = sig
                await ws.send_text(b.model_dump_json())
            await asyncio.sleep(2)
        await ws.close()
    except (WebSocketDisconnect, RuntimeError):
        return


@router.get("/tv/admin", response_model=list[TvAdminItem])
async def tv_admin(_: dict = Depends(current_user)):
    return [
        TvAdminItem(id=l["id"], code=l["code"], finished_at=_aware(l["oil_ready_at"]),
                    hidden=bool(s.get("hidden")), removed=bool(s.get("removed")))
        for l, s in await _finished_today()
    ]


@router.patch("/tv/items/{id}", response_model=TvAdminItem)
async def tv_update(id: str, body: TvItemUpdate, _: dict = Depends(current_user)):
    load = await db.loads.find_one({"id": id}, {"_id": 0, "id": 1, "code": 1, "oil_ready_at": 1})
    if not load or not load.get("oil_ready_at"):
        raise HTTPException(404, "not_found")
    upd = body.model_dump(exclude_none=True)
    s = await db.tv_state.find_one_and_update(
        {"load_id": id}, {"$set": {"load_id": id, **upd}}, upsert=True, return_document=True, projection={"_id": 0})
    return TvAdminItem(id=id, code=load["code"], finished_at=_aware(load["oil_ready_at"]),
                       hidden=bool(s.get("hidden")), removed=bool(s.get("removed")))
