"""Invoice management tied to existing completed loads. Admin-only; no destructive load changes."""
import math
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from lib.auth import current_user, require_admin
from lib.db import db

router = APIRouter(tags=["invoices"])


def _money(value):
    return round(float(value or 0), 3)


def _number(value, error_code: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(422, error_code)
    if not math.isfinite(number):
        raise HTTPException(422, error_code)
    return number


def _public(doc):
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


@router.get("/invoices")
async def list_invoices(q: str = "", _: dict = Depends(current_user)):
    flt = {}
    if q.strip():
        term = re.escape(q.strip())
        flt["$or"] = [
            {"number": {"$regex": term, "$options": "i"}},
            {"client_name": {"$regex": term, "$options": "i"}},
            {"load_code": {"$regex": term, "$options": "i"}},
            {"phone": {"$regex": term, "$options": "i"}},
        ]
    docs = await db.invoices.find(flt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/invoices/eligible-loads")
async def eligible_loads(_: dict = Depends(require_admin)):
    billed = await db.invoices.distinct("load_id")
    docs = await db.loads.find({
        "oil_kg": {"$ne": None},
        "cancelled": {"$ne": True},
        "id": {"$nin": billed},
    }, {"_id": 0, "id": 1, "code": 1, "client_name": 1, "phone": 1,
        "olive_kg": 1, "day": 1, "season_id": 1, "variety": 1}).sort("created_at", -1).to_list(1000)
    return docs


@router.post("/invoices")
async def create_invoice(body: dict, user: dict = Depends(require_admin)):
    load_id = str(body.get("load_id") or "").strip()
    if not load_id:
        raise HTTPException(422, "load_id_required")
    load = await db.loads.find_one({"id": load_id}, {"_id": 0})
    if not load or load.get("oil_kg") is None or load.get("cancelled"):
        raise HTTPException(400, "load_not_completed_or_cancelled")
    if await db.invoices.find_one({"load_id": load_id}):
        raise HTTPException(409, "load_already_invoiced")
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0}) or {}
    price = _number(settings.get("price_per_kg", 0), "price_invalid")
    if price < 0:
        raise HTTPException(422, "price_invalid")
    price = _money(price)
    paid = _money(_number(body.get("paid_amount", 0), "paid_amount_invalid"))
    if paid < 0:
        raise HTTPException(422, "paid_amount_invalid")
    total = _money(float(load["olive_kg"]) * price)
    if paid > total:
        raise HTTPException(422, "paid_amount_exceeds_total")
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "number": f"FAC-{load['code']}",
        "load_id": load["id"], "load_code": load["code"],
        "client_name": load["client_name"], "phone": load.get("phone", ""),
        "olive_kg": float(load["olive_kg"]), "price_per_kg": price,
        "total": total, "paid_amount": paid, "balance": _money(total - paid),
        "payments": ([{"at": now, "by": user.get("username", ""), "amount": paid}] if paid > 0 else []),
        "day": load.get("day", now.strftime("%Y-%m-%d")),
        "created_at": now, "updated_at": now,
        "mill_name": settings.get("mill_name", ""), "mill_address": settings.get("mill_address", ""),
        "mill_phone": settings.get("mill_phone", ""), "mill_logo": settings.get("mill_logo", ""),
        "created_by": user.get("username", ""),
        "history": [{"at": now, "by": user.get("username", ""), "action": "created",
                     "before": None, "after": {"price_per_kg": price, "paid_amount": paid,
                                                  "total": total, "balance": _money(total - paid)}}],
    }
    try:
        await db.invoices.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "load_already_invoiced")
    return _public(doc)


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: dict, user: dict = Depends(require_admin)):
    if not any(key in body for key in ("price_per_kg", "payment_amount", "paid_amount")):
        raise HTTPException(422, "no_editable_fields")
    doc = await db.invoices.find_one({"id": invoice_id})
    if not doc:
        raise HTTPException(404, "invoice_not_found")
    allowed = {}
    if "price_per_kg" in body:
        price = _number(body["price_per_kg"], "price_invalid")
        if price < 0:
            raise HTTPException(422, "price_invalid")
        allowed["price_per_kg"] = _money(price)
    old_paid = _money(doc.get("paid_amount", 0))
    payment_amount = 0.0
    if "payment_amount" in body:
        payment_amount = _money(_number(body["payment_amount"], "paid_amount_invalid"))
        if payment_amount < 0:
            raise HTTPException(422, "paid_amount_invalid")
    # Keep compatibility with older clients that still send paid_amount as a replacement value.
    if "paid_amount" in body:
        paid_value = _money(_number(body["paid_amount"], "paid_amount_invalid"))
        if paid_value < 0:
            raise HTTPException(422, "paid_amount_invalid")
        old_paid = paid_value
    price = allowed.get("price_per_kg", float(doc["price_per_kg"]))
    total = _money(float(doc["olive_kg"]) * price)
    paid = _money(old_paid + payment_amount) if "payment_amount" in body else old_paid
    if paid > total:
        raise HTTPException(422, "paid_amount_exceeds_total")
    allowed["paid_amount"] = paid
    allowed["total"] = total
    allowed["balance"] = _money(total - paid)
    new_payments = list(doc.get("payments") or [])
    if payment_amount > 0:
        new_payments.append({"at": datetime.now(timezone.utc), "by": user.get("username", ""), "amount": payment_amount})
        allowed["payments"] = new_payments
    now = datetime.now(timezone.utc)
    before = {"price_per_kg": doc["price_per_kg"], "paid_amount": doc["paid_amount"],
              "total": doc["total"], "balance": doc["balance"]}
    after = {"price_per_kg": allowed["price_per_kg"], "paid_amount": allowed["paid_amount"],
             "total": total, "balance": allowed["balance"]}
    # Do not create an audit event when the requested edit changes no invoice values.
    if all(before[key] == after[key] for key in before):
        return _public(doc)
    audit_event = {"at": now, "by": user.get("username", ""), "action": "updated",
                   "before": before, "after": after}
    # Optimistic concurrency prevents simultaneous edits from overwriting each other's
    # invoice values or audit history.
    result = await db.invoices.update_one(
        {"id": invoice_id, "updated_at": doc.get("updated_at")},
        {"$set": {**allowed, "updated_at": now}, "$push": {"history": audit_event}},
    )
    if not result.modified_count:
        raise HTTPException(409, "invoice_changed_retry")
    updated = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return updated


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, _: dict = Depends(require_admin)):
    result = await db.invoices.delete_one({"id": invoice_id})
    if not result.deleted_count:
        raise HTTPException(404, "invoice_not_found")
    return {"ok": True}
