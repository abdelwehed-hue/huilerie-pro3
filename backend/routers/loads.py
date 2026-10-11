import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db
from models.schemas import DailyPoint, LabAnalysis, Load, LoadCreate, OilUpdate, Stats

router = APIRouter(tags=["loads"])


def _tz() -> ZoneInfo:
    return ZoneInfo(os.environ.get("APP_TZ", "UTC"))


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _price() -> float:
    s = await db.settings.find_one({"key": "app"})
    return float(s["price_per_kg"]) if s else 0.0


def to_load(doc: dict, user: dict, lab: Optional[dict] = None) -> Load:
    is_admin = user["role"] == "admin"
    oil = doc.get("oil_kg")
    return Load(
        id=doc["id"], code=doc["code"], client_name=doc["client_name"], phone=doc["phone"],
        olive_kg=doc["olive_kg"], oil_kg=oil,
        yield_pct=round(oil / doc["olive_kg"] * 100, 2) if oil is not None and doc["olive_kg"] else None,
        status="done" if oil is not None else "pending",
        day=doc["day"], created_at=_aware(doc["created_at"]), created_by=doc["created_by"],
        price_per_kg=doc.get("price_per_kg") if is_admin else None,
        amount=round(doc["olive_kg"] * doc.get("price_per_kg", 0), 3) if is_admin else None,
        lab=LabAnalysis(**{**lab, "created_at": _aware(lab["created_at"])}) if lab else None,
    )


async def _labs_for(ids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    async for lab in db.lab.find({"load_id": {"$in": ids}}, {"_id": 0}).sort("created_at", 1):
        out[lab["load_id"]] = lab  # latest wins
    return out


@router.post("/loads", response_model=Load)
async def create_load(body: LoadCreate, user: dict = Depends(current_user)):
    now_local = datetime.now(_tz())
    base = now_local.strftime("%y%m%d%H%M")
    code, n = base, 1
    while await db.loads.find_one({"code": code}):
        n += 1
        code = f"{base}-{n}"
    doc = {
        "id": str(uuid.uuid4()), "code": code, "client_name": body.client_name.strip(),
        "phone": body.phone.strip(), "olive_kg": body.olive_kg, "oil_kg": None,
        "day": now_local.strftime("%Y-%m-%d"), "created_at": datetime.now(timezone.utc),
        "created_by": user["username"], "price_per_kg": await _price(),
    }
    await db.loads.insert_one(doc)
    return to_load(doc, user)


@router.get("/loads", response_model=list[Load])
async def list_loads(q: str = "", status: str = "", user: dict = Depends(current_user)):
    flt: dict = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        flt["$or"] = [{"code": rx}, {"client_name": rx}, {"phone": rx}]
    if status == "pending":
        flt["oil_kg"] = None
    elif status == "done":
        flt["oil_kg"] = {"$ne": None}
    docs = await db.loads.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    labs = await _labs_for([d["id"] for d in docs])
    return [to_load(d, user, labs.get(d["id"])) for d in docs]


@router.get("/loads/by-code/{code}", response_model=Load)
async def get_by_code(code: str, user: dict = Depends(current_user)):
    doc = await db.loads.find_one({"code": code.strip()}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "code_not_found")
    labs = await _labs_for([doc["id"]])
    return to_load(doc, user, labs.get(doc["id"]))


@router.patch("/loads/{id}/oil", response_model=Load)
async def set_oil(id: str, body: OilUpdate, user: dict = Depends(current_user)):
    doc = await db.loads.find_one_and_update(
        {"id": id}, {"$set": {"oil_kg": body.oil_kg, "oil_by": user["username"]}},
        projection={"_id": 0}, return_document=True,
    )
    if not doc:
        raise HTTPException(404, "not_found")
    labs = await _labs_for([id])
    return to_load(doc, user, labs.get(id))


@router.delete("/loads/{id}")
async def delete_load(id: str, _: dict = Depends(require_admin)):
    res = await db.loads.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "not_found")
    await db.lab.delete_many({"load_id": id})
    return {"ok": True}


@router.get("/stats", response_model=Stats)
async def stats(user: dict = Depends(current_user)):
    is_admin = user["role"] == "admin"
    today = today_iso()
    docs = await db.loads.find({}, {"_id": 0}).to_list(100000)
    by_day: dict[str, list[float]] = {}
    o_t = oil_t = rev_t = 0.0
    olive_done = oil_done = 0.0
    for d in docs:
        rev = d["olive_kg"] * d.get("price_per_kg", 0)
        oil = d.get("oil_kg") or 0.0
        agg = by_day.setdefault(d["day"], [0.0, 0.0, 0.0, 0.0])
        agg[0] += d["olive_kg"]; agg[1] += oil; agg[2] += rev; agg[3] += 1
        o_t += d["olive_kg"]; oil_t += oil; rev_t += rev
        if d.get("oil_kg") is not None:
            olive_done += d["olive_kg"]; oil_done += d["oil_kg"]
    start = datetime.strptime(today, "%Y-%m-%d") - timedelta(days=13)
    daily = []
    for i in range(14):
        day = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        a = by_day.get(day, [0.0, 0.0, 0.0, 0.0])
        daily.append(DailyPoint(day=day, olive_kg=round(a[0], 2), oil_kg=round(a[1], 2),
                                revenue=round(a[2], 3) if is_admin else None))
    t = by_day.get(today, [0.0, 0.0, 0.0, 0.0])
    return Stats(
        today=today, loads_today=int(t[3]), loads_total=len(docs),
        pending=sum(1 for d in docs if d.get("oil_kg") is None),
        olive_kg_today=round(t[0], 2), oil_kg_today=round(t[1], 2),
        olive_kg_total=round(o_t, 2), oil_kg_total=round(oil_t, 2),
        avg_yield=round(oil_done / olive_done * 100, 2) if olive_done else None,
        revenue_today=round(t[2], 3) if is_admin else None,
        revenue_total=round(rev_t, 3) if is_admin else None,
        daily=daily,
    )
