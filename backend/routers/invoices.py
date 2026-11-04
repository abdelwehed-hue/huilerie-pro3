"""Invoice management tied to existing completed loads. Admin-only; no destructive load changes."""
import math
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from lib.auth import current_user, require_admin
from lib.db import db, run_transaction

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
async def list_invoices(q: str = "", user: dict = Depends(current_user)):
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
    # Enrich invoices with the olive variety stored on their source load.
    # Also repair legacy invoices whose billed oil quantity was not persisted.
    load_ids = [doc.get("load_id") for doc in docs if doc.get("load_id")]
    loads_by_id = {}
    if load_ids:
        async for load in db.loads.find(
            {"id": {"$in": load_ids}},
            {"_id": 0, "id": 1, "variety": 1, "oil_kg": 1},
        ):
            loads_by_id[load["id"]] = load
    for doc in docs:
        load = loads_by_id.get(doc.get("load_id"), {})
        if not doc.get("variety"):
            doc["variety"] = load.get("variety")
        if doc.get("oil_kg") is None and load.get("oil_kg") is not None:
            oil_kg = float(load["oil_kg"])
            total = _money(oil_kg * float(doc.get("price_per_kg", 0)))
            paid = _money(doc.get("paid_amount", 0))
            balance = _money(max(0, total - paid))
            repaired_at = datetime.now(timezone.utc)

            async def repair_legacy_invoice(session):
                result = await db.invoices.update_one(
                    {"id": doc["id"], "oil_kg": None},
                    {"$set": {
                        "oil_kg": oil_kg, "total": total, "balance": balance,
                        "updated_at": repaired_at,
                    }},
                    session=session,
                )
                if result.modified_count:
                    await db.commercial_audit_events.insert_one({
                        "id": str(uuid.uuid4()), "entity_type": "traditional_invoice",
                        "entity_id": doc["id"], "action": "INVOICE_LEGACY_REPAIRED",
                        "actor_user_id": user.get("id"), "created_at": repaired_at,
                        "details": {
                            "number": doc.get("number"), "oil_kg": oil_kg,
                            "total": total, "balance": balance,
                            "reason": "backfill_missing_oil_weight_from_source_load",
                        },
                    }, session=session)
                return bool(result.modified_count)

            if await run_transaction(repair_legacy_invoice):
                doc.update({"oil_kg": oil_kg, "total": total, "balance": balance})
    return docs


@router.get("/invoices/eligible-loads")
async def eligible_loads(_: dict = Depends(require_admin)):
    billed = await db.invoices.distinct("load_id")
    docs = await db.loads.find({
        "oil_kg": {"$ne": None},
        "cancelled": {"$ne": True},
        "id": {"$nin": billed},
    }, {"_id": 0, "id": 1, "code": 1, "client_name": 1, "phone": 1,
        "olive_kg": 1, "oil_kg": 1, "day": 1, "season_id": 1, "variety": 1}).sort("created_at", -1).to_list(1000)
    return docs


async def _create_invoice_in_session(body: dict, user: dict, session):
    load_id = str(body.get("load_id") or "").strip()
    if not load_id:
        raise HTTPException(422, "load_id_required")
    load = await db.loads.find_one({"id": load_id}, {"_id": 0}, session=session)
    if not load or load.get("oil_kg") is None or load.get("cancelled"):
        raise HTTPException(400, "load_not_completed_or_cancelled")
    if await db.invoices.find_one({"load_id": load_id}, session=session):
        raise HTTPException(409, "load_already_invoiced")
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0}, session=session) or {}
    price = _number(settings.get("price_per_kg", 0), "price_invalid")
    if price < 0:
        raise HTTPException(422, "price_invalid")
    price = _money(price)
    paid = _money(_number(body.get("paid_amount", 0), "paid_amount_invalid"))
    if paid < 0:
        raise HTTPException(422, "paid_amount_invalid")
    oil_kg = float(load["oil_kg"])
    total = _money(oil_kg * price)
    if paid > total:
        raise HTTPException(422, "paid_amount_exceeds_total")
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "number": f"FAC-{load['code']}",
        "load_id": load["id"], "load_code": load["code"],
        "client_name": load["client_name"], "phone": load.get("phone", ""),
        "variety": load.get("variety"),
        "olive_kg": float(load["olive_kg"]), "oil_kg": oil_kg, "price_per_kg": price,
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

    # Touch the source load in the same transaction as the invoice insert.
    # A concurrent delete of this load must conflict with this write; merely
    # checking the invoice collection would leave a check-then-delete race.
    guarded = await db.loads.update_one(
        {"id": load_id, "oil_kg": load["oil_kg"], "cancelled": {"$ne": True}},
        {"$inc": {"invoice_guard_version": 1}},
        session=session,
    )
    if not guarded.matched_count:
        raise HTTPException(409, "load_changed_retry")
    await db.invoices.insert_one(doc, session=session)
    await db.commercial_audit_events.insert_one({
        "id": str(uuid.uuid4()), "entity_type": "traditional_invoice",
        "entity_id": doc["id"], "action": "INVOICE_CREATED",
        "actor_user_id": user.get("id"), "created_at": now,
        "details": {"number": doc["number"], "load_id": load_id,
                    "client_name": doc["client_name"], "total": total,
                    "paid_amount": paid, "balance": doc["balance"]},
    }, session=session)
    return _public(doc)


@router.post("/invoices")
async def create_invoice(body: dict, user: dict = Depends(require_admin)):
    try:
        return await run_transaction(
            lambda session: _create_invoice_in_session(body, user, session)
        )
    except DuplicateKeyError:
        raise HTTPException(409, "load_already_invoiced")


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: dict, user: dict = Depends(require_admin)):
    if not any(key in body for key in ("price_per_kg", "payment_amount", "paid_amount")):
        raise HTTPException(422, "no_editable_fields")

    async def operation(session):
        doc = await db.invoices.find_one({"id": invoice_id}, session=session)
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
        # Compatibility with older clients sending paid_amount as a replacement value.
        if "paid_amount" in body:
            paid_value = _money(_number(body["paid_amount"], "paid_amount_invalid"))
            if paid_value < 0:
                raise HTTPException(422, "paid_amount_invalid")
            old_paid = paid_value

        price = allowed.get("price_per_kg", float(doc["price_per_kg"]))
        oil_kg = doc.get("oil_kg")
        if oil_kg is None:
            load = await db.loads.find_one(
                {"id": doc.get("load_id")}, {"_id": 0, "oil_kg": 1}, session=session
            )
            if not load or load.get("oil_kg") is None:
                raise HTTPException(409, "invoice_oil_weight_missing")
            oil_kg = float(load["oil_kg"])
            allowed["oil_kg"] = oil_kg

        total = _money(float(oil_kg) * price)
        paid = _money(old_paid + payment_amount) if "payment_amount" in body else old_paid
        if paid > total:
            raise HTTPException(422, "paid_amount_exceeds_total")
        allowed.update({
            "paid_amount": paid,
            "total": total,
            "balance": _money(total - paid),
        })

        now = datetime.now(timezone.utc)
        before = {
            "price_per_kg": doc.get("price_per_kg", 0),
            "paid_amount": doc.get("paid_amount", 0),
            "total": doc.get("total", 0),
            "balance": doc.get("balance", 0),
        }
        after = {
            "price_per_kg": allowed["price_per_kg"] if "price_per_kg" in allowed else doc["price_per_kg"],
            "paid_amount": allowed["paid_amount"],
            "total": total,
            "balance": allowed["balance"],
        }
        if all(before[key] == after[key] for key in before) and payment_amount == 0:
            return _public(doc)

        update_fields = {**allowed, "updated_at": now}
        history_event = {
            "at": now, "by": user.get("username", ""), "action": "updated",
            "before": before, "after": after,
        }
        result = await db.invoices.update_one(
            {"id": invoice_id, "updated_at": doc.get("updated_at")},
            {"$set": update_fields, "$push": {"history": history_event}},
            session=session,
        )
        if not result.modified_count:
            raise HTTPException(409, "invoice_changed_retry")

        await db.commercial_audit_events.insert_one({
            "id": str(uuid.uuid4()), "entity_type": "traditional_invoice",
            "entity_id": invoice_id, "action": "INVOICE_UPDATED",
            "actor_user_id": user.get("id"), "created_at": now,
            "details": {"number": doc.get("number"), "previous_values": before,
                        "new_values": after, "payment_amount": payment_amount},
        }, session=session)
        updated = await db.invoices.find_one({"id": invoice_id}, {"_id": 0}, session=session)
        return updated

    return await run_transaction(operation)

@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(require_admin)):
    async def operation(session):
        doc = await db.invoices.find_one({"id": invoice_id}, {"_id": 0}, session=session)
        if not doc:
            raise HTTPException(404, "invoice_not_found")
        result = await db.invoices.delete_one(
            {"id": invoice_id, "updated_at": doc.get("updated_at")},
            session=session,
        )
        if not result.deleted_count:
            raise HTTPException(409, "invoice_changed_retry")
        await db.commercial_audit_events.insert_one({
            "id": str(uuid.uuid4()), "entity_type": "traditional_invoice",
            "entity_id": invoice_id, "action": "INVOICE_DELETED",
            "actor_user_id": user.get("id"), "created_at": datetime.now(timezone.utc),
            "details": {"number": doc.get("number"), "load_id": doc.get("load_id"),
                        "client_name": doc.get("client_name"), "total": doc.get("total"),
                        "paid_amount": doc.get("paid_amount"), "balance": doc.get("balance")},
        }, session=session)
    await run_transaction(operation)
    return {"ok": True}
