"""Season (campaign Oct->Apr) selection and olive varieties."""

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db
from lib.season import DEFAULT_VARIETIES, active_season, season_of, valid_season
from models.schemas import SeasonInfo, SeasonSet, Varieties

router = APIRouter(tags=["campaign"])


async def _info() -> SeasonInfo:
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "active_season": 1, "seasons": 1}) or {}
    current = season_of(today_iso())
    seasons = {current, *(s.get("seasons") or [])}
    seasons.update(x for x in await db.loads.distinct("season_id") if x)
    active = await active_season()
    seasons.add(active)
    return SeasonInfo(current=current, active=active, auto=not s.get("active_season"),
                      available=sorted(seasons, reverse=True))


@router.get("/seasons", response_model=SeasonInfo)
async def get_seasons(_: dict = Depends(current_user)):
    return await _info()


@router.post("/seasons", response_model=SeasonInfo)
async def create_season(body: SeasonSet, _: dict = Depends(require_admin)):
    """Register a season (e.g. 2025-2026) so it can be selected. Creates no data."""
    if not valid_season(body.season):
        raise HTTPException(422, "invalid_season")
    await db.settings.update_one({"key": "app"}, {"$addToSet": {"seasons": body.season}}, upsert=True)
    return await _info()


@router.put("/seasons/active", response_model=SeasonInfo)
async def set_season(body: SeasonSet, _: dict = Depends(require_admin)):
    """Only changes which season is displayed / used for NEW operations. Never touches existing data."""
    if body.season and not valid_season(body.season):
        raise HTTPException(422, "invalid_season")
    upd: dict = {"$set": {"active_season": body.season}}
    if body.season:
        upd["$addToSet"] = {"seasons": body.season}
    await db.settings.update_one({"key": "app"}, upd, upsert=True)
    return await _info()


@router.get("/varieties", response_model=Varieties)
async def get_varieties(_: dict = Depends(current_user)):
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "varieties": 1}) or {}
    return Varieties(varieties=s.get("varieties") or DEFAULT_VARIETIES)


@router.put("/varieties", response_model=Varieties)
async def put_varieties(body: Varieties, _: dict = Depends(require_admin)):
    seen: list[str] = []
    for v in (x.strip() for x in body.varieties):
        if v and v.lower() not in {s.lower() for s in seen}:
            seen.append(v)
    await db.settings.update_one({"key": "app"}, {"$set": {"varieties": seen}}, upsert=True)
    return Varieties(varieties=seen)
