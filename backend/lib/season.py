"""Olive season (campaign): 1 October -> 30 April. A new season begins every 1 October.

Every load carries a permanent `season_id` ("2026-2027") = the active season when it was created.
Lab analyses and SMS logs inherit the season of their load. All operational lists filter on it.
"""

import logging
import re

from pymongo import ReturnDocument

from lib.dates import today_iso
from lib.db import db

log = logging.getLogger(__name__)

DEFAULT_VARIETIES = ["Chemlali", "Chétoui", "Oueslati", "Zarrazi", "Gerboui", "Meski", "Mixte"]
SEASON_RX = re.compile(r"^(\d{4})-(\d{4})$")
CODE_SEQ_START = 100


def season_of(day: str) -> str:
    """Season by date. May-Sep (off-season) stays attached to the season that just ended."""
    y, m = int(day[:4]), int(day[5:7])
    a = y if m >= 10 else y - 1
    return f"{a}-{a + 1}"


def valid_season(s: str) -> bool:
    m = SEASON_RX.match(s or "")
    return bool(m) and int(m.group(2)) == int(m.group(1)) + 1


def season_prefix(season: str) -> str:
    """'2026-2027' -> '2627' (receipt code prefix)."""
    a, b = season.split("-")
    return a[2:] + b[2:]


async def active_season() -> str:
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "active_season": 1}) or {}
    return s.get("active_season") or season_of(today_iso())


async def season_filter(season: str = "") -> dict:
    """Mongo filter on `season_id` ("" = active season, "all" = no filter)."""
    if season == "all":
        return {}
    return {"season_id": season if valid_season(season) else await active_season()}


async def next_load_code(season: str) -> str:
    """Atomic per-season sequence: 2627100, 2627101, ... (never reuses an existing code)."""
    prefix = season_prefix(season)
    while True:
        c = await db.counters.find_one_and_update(
            {"_id": f"load_seq:{season}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
        code = f"{prefix}{CODE_SEQ_START - 1 + c['seq']}"
        if not await db.loads.find_one({"code": code}, {"_id": 1}):
            return code


async def migrate_season_ids() -> None:
    """Idempotent: only ADDS `season_id` where missing (loads by their date; lab/sms from their load).
    Never changes codes or any other field."""
    n = 0
    async for d in db.loads.find({"season_id": {"$exists": False}}, {"_id": 1, "day": 1}):
        await db.loads.update_one({"_id": d["_id"]}, {"$set": {"season_id": season_of(d["day"])}})
        n += 1
    seasons = {d["id"]: d["season_id"] async for d in db.loads.find({}, {"_id": 0, "id": 1, "season_id": 1})}
    for coll in (db.lab, db.sms_log):
        async for d in coll.find({"season_id": {"$exists": False}}, {"_id": 1, "load_id": 1}):
            s = seasons.get(d.get("load_id"))
            if s:
                await coll.update_one({"_id": d["_id"]}, {"$set": {"season_id": s}})
                n += 1
    if n:
        log.info("season migration: season_id added to %d documents", n)
