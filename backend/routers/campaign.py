"""Season (campaign Oct->Apr) selection and olive varieties."""

from fastapi import APIRouter, Depends

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db
from lib.season import DEFAULT_VARIETIES, active_season, season_of
from models.schemas import SeasonInfo, SeasonSet, Varieties

router = APIRouter(tags=["campaign"])


async def _info() -> SeasonInfo:
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "active_season": 1}) or {}
    current = season_of(today_iso())
    a = int(current[:4])
    seasons = {current, f"{a + 1}-{a + 2}"}
    days = await db.loads.distinct("day")
    seasons.update(season_of(d) for d in days if d)
    return SeasonInfo(current=current, active=await active_season(), auto=not s.get("active_season"),
                      available=sorted(seasons, reverse=True))


@router.get("/seasons", response_model=SeasonInfo)
async def get_seasons(_: dict = Depends(current_user)):
    return await _info()


@router.put("/seasons/active", response_model=SeasonInfo)
async def set_season(body: SeasonSet, _: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "app"}, {"$set": {"active_season": body.season}}, upsert=True)
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
