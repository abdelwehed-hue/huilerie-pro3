import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db
from lib.season import active_season, next_load_code, season_filter, season_of
from lib.sms import send_load_sms
from routers.invoices import create_invoice as create_load_invoice
from models.schemas import CancelBody, DailyPoint, LabAnalysis, Load, LoadCreate, OilUpdate, Stats, StatusUpdate

router = APIRouter(tags=["loads"])
log = logging.getLogger(__name__)


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
        status="cancelled" if doc.get("cancelled") else (
            "delivered" if doc.get("delivered") else (
                "done" if oil is not None else ("pressing" if doc.get("pressing") else "pending"))),
        day=doc["day"], season=doc.get("season_id") or season_of(doc["day"]),
        created_at=_aware(doc["created_at"]), created_by=doc["created_by"],
        created_by_name=doc.get("created_by_name"), bags=doc.get("bags"),
        variety=doc.get("variety"), notes=doc.get("notes"),
        oil_ready_at=_aware(doc["oil_ready_at"]) if doc.get("oil_ready_at") else None,
        delivered_at=_aware(doc["delivered_at"]) if doc.get("delivered_at") else None,
        delivered_by=doc.get("delivered_by"),
        reminder_sent_at=_aware(doc["reminder_sent_at"]) if doc.get("reminder_sent_at") else None,
        cancel_reason=doc.get("cancel_reason"), cancelled_by=doc.get("cancelled_by"),
        cancelled_at=_aware(doc["cancelled_at"]) if doc.get("cancelled_at") else None,
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
    season = await active_season()
    code = await next_load_code(season)
    doc = {
        "id": str(uuid.uuid4()), "code": code, "season_id": season, "client_name": body.client_name.strip(),
        "phone": re.sub(r"\s+", "", body.phone), "olive_kg": body.olive_kg, "oil_kg": None,
        "day": now_local.strftime("%Y-%m-%d"), "created_at": datetime.now(timezone.utc),
        "created_by": user["username"], "created_by_name": user.get("full_name") or user["username"],
        "price_per_kg": await _price(),
        "bags": body.bags, "variety": (body.variety or "").strip() or None,
        "notes": (body.notes or "").strip() or None, "pressing": body.initial_status == "pressing",
    }
    await db.loads.insert_one(doc)
    doc.pop("_id", None)
    await send_load_sms(doc, "arrival")
    return to_load(doc, user)


@router.get("/loads", response_model=list[Load])
async def list_loads(q: str = "", status: str = "", season: str = "", worker: str = "", user: dict = Depends(current_user)):
    flt: dict = await season_filter(season)
    if worker:
        flt["created_by"] = worker
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        flt["$or"] = [{"code": rx}, {"client_name": rx}, {"phone": rx}]
    if status == "pending":
        flt["oil_kg"] = None
        flt["cancelled"] = {"$ne": True}
        flt["pressing"] = {"$ne": True}
    elif status == "pressing":
        flt["oil_kg"] = None
        flt["cancelled"] = {"$ne": True}
        flt["pressing"] = True
    elif status == "done":
        flt["oil_kg"] = {"$ne": None}
        flt["cancelled"] = {"$ne": True}
        flt["delivered"] = {"$ne": True}
    elif status == "delivered":
        flt["delivered"] = True
        flt["cancelled"] = {"$ne": True}
    elif status == "cancelled":
        flt["cancelled"] = True
    docs = await db.loads.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    labs = await _labs_for([d["id"] for d in docs])
    return [to_load(d, user, labs.get(d["id"])) for d in docs]


@router.get("/loads/by-code/{code}", response_model=Load)
async def get_by_code(code: str, user: dict = Depends(current_user)):
    doc = await db.loads.find_one({"code": code.strip(), **(await season_filter())}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "code_not_found")
    labs = await _labs_for([doc["id"]])
    return to_load(doc, user, labs.get(doc["id"]))


async def _ensure_load_invoice(id: str, user: dict) -> None:
    """Create the automatic invoice, treating an existing invoice as a safe retry."""
    try:
        await create_load_invoice({"load_id": id, "paid_amount": 0}, user)
    except HTTPException as exc:
        if exc.status_code != 409 or exc.detail != "load_already_invoiced":
            raise


@router.patch("/loads/{id}/oil", response_model=Load)
async def set_oil(id: str, body: OilUpdate, user: dict = Depends(current_user)):
    before = await db.loads.find_one({"id": id}, {"_id": 0, "oil_kg": 1, "cancelled": 1, "delivered": 1})
    if not before:
        raise HTTPException(404, "not_found")
    if before.get("cancelled"):
        raise HTTPException(409, "load_cancelled")
    if before.get("delivered"):
        raise HTTPException(409, "load_already_delivered")

    # A retry with the same saved oil weight repairs a missing automatic invoice
    # after a transient invoice/database failure, without changing the oil value
    # or sending the customer a duplicate SMS.
    if before.get("oil_kg") is not None:
        if float(before["oil_kg"]) != float(body.oil_kg):
            raise HTTPException(409, "oil_already_entered")
        await _ensure_load_invoice(id, user)
        doc = await db.loads.find_one({"id": id}, {"_id": 0})
        labs = await _labs_for([id])
        return to_load(doc, user, labs.get(id))

    upd: dict = {"oil_kg": body.oil_kg, "oil_by": user["username"],
                 "oil_ready_at": datetime.now(timezone.utc)}
    # Only the first oil entry is accepted; completed loads are immutable.
    doc = await db.loads.find_one_and_update(
        {"id": id, "oil_kg": None, "cancelled": {"$ne": True}, "delivered": {"$ne": True}},
        {"$set": upd},
        projection={"_id": 0}, return_document=True,
    )
    if not doc:
        current = await db.loads.find_one({"id": id}, {"_id": 0, "oil_kg": 1, "cancelled": 1, "delivered": 1})
        if not current:
            raise HTTPException(404, "not_found")
        if current.get("cancelled"):
            raise HTTPException(409, "load_cancelled")
        if current.get("delivered"):
            raise HTTPException(409, "load_already_delivered")
        raise HTTPException(409, "oil_already_entered")

    # Invoice creation is the accounting-critical operation: do it before SMS.
    # If it fails, a same-value retry above can safely complete the invoice.
    await _ensure_load_invoice(id, user)

    # SMS is a notification, not a prerequisite for completing the load/invoice.
    try:
        await send_load_sms(doc, "ready")
    except Exception:
        log.exception("Ready SMS failed for completed load %s", id)

    labs = await _labs_for([id])
    return to_load(doc, user, labs.get(id))


@router.patch("/loads/{id}/status", response_model=Load)
async def set_status(id: str, body: StatusUpdate, user: dict = Depends(current_user)):
    cur = await db.loads.find_one({"id": id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "not_found")
    if cur.get("cancelled"):
        raise HTTPException(409, "load_cancelled")
    has_oil = cur.get("oil_kg") is not None
    st = body.status
    if st in ("pending", "pressing") and has_oil:
        raise HTTPException(409, "oil_already_entered")
    if st in ("done", "delivered") and not has_oil:
        raise HTTPException(409, "oil_not_ready")
    upd: dict = {"pressing": st == "pressing"}
    if st == "delivered":
        if not cur.get("delivered"):
            upd.update(delivered=True, delivered_at=datetime.now(timezone.utc), delivered_by=user["username"])
    else:
        upd.update(delivered=False, delivered_at=None, delivered_by=None)
    doc = await db.loads.find_one_and_update({"id": id}, {"$set": upd}, projection={"_id": 0}, return_document=True)
    labs = await _labs_for([id])
    return to_load(doc, user, labs.get(id))


@router.post("/loads/{id}/deliver", response_model=Load)
async def deliver_load(id: str, user: dict = Depends(current_user)):
    cur = await db.loads.find_one({"id": id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "not_found")
    if cur.get("cancelled"):
        raise HTTPException(409, "load_cancelled")
    if cur.get("oil_kg") is None:
        raise HTTPException(409, "oil_not_ready")
    if cur.get("delivered"):
        raise HTTPException(409, "already_delivered")
    doc = await db.loads.find_one_and_update(
        {"id": id},
        {"$set": {"delivered": True, "delivered_at": datetime.now(timezone.utc), "delivered_by": user["username"]}},
        projection={"_id": 0}, return_document=True,
    )
    labs = await _labs_for([id])
    return to_load(doc, user, labs.get(id))


@router.get("/loads/cancellations", response_model=list[Load])
async def cancellations(month: str = Query("", pattern=r"^(\d{4}-\d{2})?$"), user: dict = Depends(require_admin)):
    m = month or today_iso()[:7]
    y, mo = int(m[:4]), int(m[5:7])
    tz = _tz()
    start = datetime(y, mo, 1, tzinfo=tz)
    end = datetime(y + (mo == 12), 1 if mo == 12 else mo + 1, 1, tzinfo=tz)
    docs = await db.loads.find(
        {"cancelled": True, "cancelled_at": {"$gte": start.astimezone(timezone.utc), "$lt": end.astimezone(timezone.utc)},
         **(await season_filter())},
        {"_id": 0},
    ).sort("cancelled_at", -1).to_list(1000)
    return [to_load(d, user) for d in docs]


@router.post("/loads/{id}/cancel", response_model=Load)
async def cancel_load(id: str, body: CancelBody, user: dict = Depends(require_admin)):
    doc = await db.loads.find_one_and_update(
        {"id": id, "cancelled": {"$ne": True}},
        {"$set": {"cancelled": True, "cancel_reason": body.reason.strip(),
                  "cancelled_at": datetime.now(timezone.utc), "cancelled_by": user["username"]}},
        projection={"_id": 0}, return_document=True,
    )
    if not doc:
        if await db.loads.find_one({"id": id}):
            raise HTTPException(409, "load_cancelled")
        raise HTTPException(404, "not_found")
    labs = await _labs_for([id])
    return to_load(doc, user, labs.get(id))


async def _ensure_load_has_no_invoice(load_id: str) -> None:
    """Preserve accounting history: a load linked to an invoice cannot be deleted."""
    invoice = await db.invoices.find_one(
        {"load_id": load_id},
        {"_id": 0, "number": 1},
    )
    if invoice:
        raise HTTPException(409, "load_has_invoice")


@router.delete("/loads/{id}")
async def delete_load(id: str, _: dict = Depends(require_admin)):
    await _ensure_load_has_no_invoice(id)
    res = await db.loads.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "not_found")
    await db.lab.delete_many({"load_id": id})
    return {"ok": True}


@router.get("/stats", response_model=Stats)
async def stats(user: dict = Depends(current_user)):
    is_admin = user["role"] == "admin"
    today = today_iso()
    season = await active_season()
    docs = await db.loads.find({"cancelled": {"$ne": True}, **(await season_filter(season))}, {"_id": 0}).to_list(100000)
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
    non_terminated = sum(
        1 for d in docs if d.get("oil_kg") is None
    )
    return Stats(
        today=today, season=season, loads_today=int(t[3]),
        non_terminated=non_terminated, loads_total=len(docs),
        pending=sum(1 for d in docs if d.get("oil_kg") is None),
        olive_kg_today=round(t[0], 2), oil_kg_today=round(t[1], 2),
        olive_kg_total=round(o_t, 2), oil_kg_total=round(oil_t, 2),
        avg_yield=round(oil_done / olive_done * 100, 2) if olive_done else None,
        revenue_today=round(t[2], 3) if is_admin else None,
        revenue_total=round(rev_t, 3) if is_admin else None,
        daily=daily,
    )
