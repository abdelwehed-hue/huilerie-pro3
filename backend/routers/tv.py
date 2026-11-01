"""Public TV screen: today's finished (Terminé) loads — codes + finish time only, never client data.

TV-only display state (hidden number / removed from screen) lives in its own `tv_state`
collection so loads themselves are never modified.
"""

import asyncio
import json
import os
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from gridfs.errors import NoFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from lib.db import db
from lib.auth import current_user
from lib.dates import today_iso
from models.schemas import TvAdminItem, TvArrival, TvBoard, TvDisplaySettings, TvItem, TvItemUpdate, TvMediaSettings

router = APIRouter()
MAX_MUSIC_BYTES = 20 * 1024 * 1024


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


@router.get("/tv/display-settings", response_model=TvDisplaySettings)
async def get_tv_display_settings():
    # Public TV page needs a safe, read-only subset; never expose price, login, or SMS settings.
    fields = {name: 1 for name in TvDisplaySettings.model_fields}
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, **fields}) or {}
    return TvDisplaySettings(**settings)


@router.get("/tv/media-settings", response_model=TvMediaSettings)
async def get_tv_media_settings(_: dict = Depends(current_user)):
    fields = {name: 1 for name in TvMediaSettings.model_fields}
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, **fields}) or {}
    return TvMediaSettings(**settings)


@router.put("/tv/media-settings", response_model=TvMediaSettings)
async def put_tv_media_settings(body: TvMediaSettings, _: dict = Depends(current_user)):
    # Dedicated TV-only update: workers can change screen media without gaining access
    # to pricing, login, SMS, or other administrative settings.
    values = body.model_dump()
    await db.settings.update_one({"key": "app"}, {"$set": values}, upsert=True)
    return body


@router.post("/tv/music/upload")
async def upload_tv_music(file: UploadFile = File(...), _: dict = Depends(current_user)):
    """Store the background MP3 in MongoDB GridFS and publish its URL in app settings."""
    filename = os.path.basename(file.filename or "background.mp3")
    if not filename.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Choisissez un fichier MP3.")
    if file.content_type and file.content_type not in {"audio/mpeg", "audio/mp3", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Format invalide : fichier MP3 requis.")

    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="tv_music_files")
    upload = None
    new_file_id = None
    size = 0
    try:
        upload = bucket.open_upload_stream(filename, metadata={"contentType": "audio/mpeg"})
        while True:
            chunk = await file.read(256 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_MUSIC_BYTES:
                await upload.abort()
                raise HTTPException(status_code=413, detail="Le fichier MP3 ne doit pas dépasser 20 Mo.")
            await upload.write(chunk)
        if size == 0:
            await upload.abort()
            raise HTTPException(status_code=400, detail="Le fichier MP3 est vide.")
        await upload.close()
        new_file_id = upload._id

        previous = await db.settings.find_one({"key": "app"}, {"_id": 0, "tv_music_file_id": 1})
        music_url = f"/api/tv/music/audio/{new_file_id}"
        await db.settings.update_one(
            {"key": "app"},
            {"$set": {
                "tv_music_url": music_url,
                "tv_music_filename": filename,
                "tv_music_file_id": str(new_file_id),
            }},
            upsert=True,
        )

        old_id = (previous or {}).get("tv_music_file_id")
        if old_id and old_id != str(new_file_id):
            try:
                await bucket.delete(ObjectId(old_id))
            except Exception:
                # The new file and settings are already committed; a stale old file is harmless.
                pass

        return {"success": True, "filename": filename, "url": music_url, "size": size}
    except HTTPException:
        raise
    except Exception as exc:
        if upload is not None and new_file_id is None:
            try:
                await upload.abort()
            except Exception:
                pass
        if new_file_id is not None:
            try:
                await bucket.delete(new_file_id)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail="Échec du stockage du fichier MP3.") from exc
    finally:
        await file.close()


@router.get("/tv/music/audio/{file_id}")
async def get_tv_music(file_id: str):
    """Public audio endpoint used by the TV screen; the file itself is not an admin setting."""
    if not ObjectId.is_valid(file_id):
        raise HTTPException(status_code=404, detail="Fichier audio introuvable.")
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="tv_music_files")
    try:
        audio_file = await bucket.open_download_stream(ObjectId(file_id))
        content = await audio_file.read()
    except NoFile as exc:
        raise HTTPException(status_code=404, detail="Fichier audio introuvable.") from exc
    return Response(content=content, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=3600"})


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
