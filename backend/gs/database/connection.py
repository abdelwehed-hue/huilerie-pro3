"""Independent MongoDB client for GS (oroverde_gs). Never falls back to main DB."""
from __future__ import annotations

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from gs.config import GS_DB_NAME, require_gs_mongo_url

logger = logging.getLogger(__name__)

_gs_client: Optional[AsyncIOMotorClient] = None
_gs_db: Optional[AsyncIOMotorDatabase] = None


def get_gs_client() -> AsyncIOMotorClient:
    global _gs_client
    if _gs_client is None:
        url = require_gs_mongo_url()
        _gs_client = AsyncIOMotorClient(url)
        logger.info("GS MongoDB client created for database %s", GS_DB_NAME)
    return _gs_client


def get_gs_db() -> AsyncIOMotorDatabase:
    global _gs_db
    if _gs_db is None:
        _gs_db = get_gs_client()[GS_DB_NAME]
    return _gs_db


async def close_gs_client() -> None:
    global _gs_client, _gs_db
    if _gs_client is not None:
        _gs_client.close()
        logger.info("GS MongoDB client closed")
    _gs_client = None
    _gs_db = None


async def gs_health() -> dict:
    try:
        client = get_gs_client()
        db = get_gs_db()
        await db.command("ping")
        tx_ok = False
        try:
            async with await client.start_session() as session:
                async with session.start_transaction():
                    await db["__gs_health"].insert_one({"ok": 1}, session=session)
                    await db["__gs_health"].delete_many({"ok": 1}, session=session)
                tx_ok = True
        except Exception as exc:
            logger.warning("GS transactions unavailable: %s", exc)
        return {"ok": True, "database": GS_DB_NAME, "transactions": tx_ok}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "database": GS_DB_NAME}
