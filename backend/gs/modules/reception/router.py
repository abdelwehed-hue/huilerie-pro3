"""GS Reception — references existing material_code only (never creates a new code)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from bson import Decimal128
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from gs.core.audit import write_audit
from gs.core.permissions import require_permission
from gs.database.connection import get_gs_db
from gs.database.transactions import run_gs_transaction

router = APIRouter(prefix="/reception", tags=["gs-reception"])


def _dec(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _d128(v: Decimal) -> Decimal128:
    return Decimal128(str(v))


def _ser(doc: dict) -> dict:
    for k, v in list(doc.items()):
        if hasattr(v, "to_decimal"):
            doc[k] = str(v.to_decimal())
    return doc


class ReceptionCreate(BaseModel):
    material_code: str = Field(min_length=3, max_length=40)
    reception_date: str = Field(description="YYYY-MM-DD")
    quantity: str
    unit: str = "kg"
    location: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=1000)


@router.get("")
async def list_receptions(
    material_code: str = Query(""),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("gs.read", "gs.manage_reception")),
):
    db = get_gs_db()
    filt: dict = {}
    if material_code.strip():
        filt["material_code"] = material_code.strip().upper()
    rows = await db.gs_receptions.find(filt, {"_id": 0}).sort("reception_date", -1).to_list(limit)
    return [_ser(r) for r in rows]


@router.post("")
async def create_reception(
    body: ReceptionCreate,
    user: dict = Depends(require_permission("gs.manage_reception")),
):
    db = get_gs_db()
    code = body.material_code.strip().upper()
    material = await db.gs_materials.find_one({"material_code": code}, {"_id": 0})
    if not material:
        raise HTTPException(404, "material_not_found")
    qty = _dec(body.quantity)
    if qty <= 0:
        raise HTTPException(422, "invalid_quantity")

    rid = str(uuid.uuid4())
    eid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    reception = {
        "id": rid,
        "material_code": code,
        "reception_date": body.reception_date,
        "quantity": _d128(qty),
        "unit": body.unit,
        "location": body.location.strip(),
        "notes": body.notes.strip(),
        "season": material.get("season"),
        "created_at": now,
        "created_by": user["id"],
    }
    event = {
        "id": eid,
        "material_code": code,
        "event_type": "reception",
        "at": now,
        "user_id": user["id"],
        "quantity": _d128(qty),
        "unit": body.unit,
        "source": "purchase",
        "destination": body.location.strip() or "reception",
        "related_document": rid,
        "notes": body.notes.strip(),
        "season": material.get("season"),
    }

    async def _tx(session):
        await db.gs_receptions.insert_one(reception, session=session)
        await db.gs_material_events.insert_one(event, session=session)
        await db.gs_materials.update_one(
            {"material_code": code},
            {"$set": {"status": "received", "updated_at": now}},
            session=session,
        )

    await run_gs_transaction(_tx)
    await write_audit(
        user_id=user["id"], action="create", module="reception",
        document_id=rid, after={"material_code": code, "quantity": str(qty)},
    )
    return _ser({k: v for k, v in reception.items() if k != "_id"})


@router.get("/{reception_id}")
async def get_reception(
    reception_id: str,
    user: dict = Depends(require_permission("gs.read", "gs.manage_reception")),
):
    db = get_gs_db()
    doc = await db.gs_receptions.find_one({"id": reception_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "reception_not_found")
    return _ser(doc)
