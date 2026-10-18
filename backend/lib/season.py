"""Olive season (campaign): 1 October -> 30 April. Off-season months (May-Sep) stay attached to the
season that just ended so no load is ever orphaned. A new season begins every 1 October."""

from lib.dates import today_iso
from lib.db import db

DEFAULT_VARIETIES = ["Chemlali", "Chétoui", "Oueslati", "Zarrazi", "Gerboui", "Meski", "Mixte"]


def season_of(day: str) -> str:
    y, m = int(day[:4]), int(day[5:7])
    a = y if m >= 10 else y - 1
    return f"{a}-{a + 1}"


def season_range(season: str) -> tuple[str, str]:
    a, b = season.split("-")
    return f"{a}-10-01", f"{b}-09-30"


async def active_season() -> str:
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "active_season": 1}) or {}
    return s.get("active_season") or season_of(today_iso())


async def season_filter(season: str = "") -> dict:
    """Mongo filter on `day` for a season ("" = active season, "all" = no filter)."""
    if season == "all":
        return {}
    start, end = season_range(season or await active_season())
    return {"day": {"$gte": start, "$lte": end}}
