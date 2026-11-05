"""Read active season from original Oro Verde app — GS never modifies it."""
from __future__ import annotations

import re

from gs.core.exceptions import GSSeasonError
from lib.season import active_season as oro_active_season
from lib.season import season_prefix, valid_season

SEASON_RX = re.compile(r"^(\d{4})-(\d{4})$")


async def get_active_season() -> str:
    season = await oro_active_season()
    if not valid_season(season):
        raise GSSeasonError("Active season is missing or invalid; cannot create numbered GS documents")
    return season


def season_code(season: str) -> str:
    if not valid_season(season):
        raise GSSeasonError(f"Invalid season format: {season}")
    return season_prefix(season)


async def require_season_for_numbering() -> tuple[str, str]:
    season = await get_active_season()
    return season, season_code(season)
