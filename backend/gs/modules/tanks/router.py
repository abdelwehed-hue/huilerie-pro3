"""Configurable tanks — mixing allowed; source allocations preserved."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from bson import Decimal128
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from gs.core.audit import write_audit
from gs.core.permissions import require_gs_access, require_permission
from gs.database.connection import get_gs_db
from gs.database.transactions import run_gs_transaction

router = APIRouter(prefix="/tanks", tags=["gs-tanks"])


def _dec(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _d128(v: Decimal) -> Decimal128:
    return Decimal128(str(v))


def _ser(doc: dict) -> dict:
    for k, v in list(doc.items()):
        if hasattr(v, "to_decimal"):
            doc[k] = str(v.to_decimal())
    return doc


class TankCreate(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    capacity: str
    location: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=500)


class TankUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class TankTransfer(BaseModel):
    source_tank_id: str
    dest_tank_id: str
    quantity: str
    notes: str = ""


@router.get("")
async def list_tanks(user: dict = Depends(require_gs_access)):
    db = get_gs_db()
    rows = await db.gs_tanks.find({}, {"_id": 0}).sort("code", 1).to_list(200)
    return [_ser(r) for r in rows]


@router.post("")
async def create_tank(body: TankCreate, user: dict = Depends(require_permission("gs.manage_tanks"))):
    db = get_gs_db()
    if await db.gs_tanks.find_one({"code": body.code.strip()}):
        raise HTTPException(409, "tank_code_exists")
    tid = str(uuid.uuid4())
    cap = _dec(body.capacity)
    if cap <= 0:
        raise HTTPException(422, "invalid_capacity")
    doc = {
        "id": tid,
        "code": body.code.strip().upper(),
        "name": body.name.strip(),
        "capacity": _d128(cap),
        "quantity": _d128(Decimal("0")),
        "location": body.location.strip(),
        "notes": body.notes.strip(),
        "active": True,
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"],
    }
    await db.gs_tanks.insert_one(doc)
    await write_audit(user_id=user["id"], action="create", module="tanks", document_id=tid, after=_ser(dict(doc)))
    doc.pop("_id", None)
    return _ser(doc)


@router.get("/{tank_id}")
async def get_tank(tank_id: str, user: dict = Depends(require_gs_access)):
    db = get_gs_db()
    tank = await db.gs_tanks.find_one({"id": tank_id}, {"_id": 0})
    if not tank:
        raise HTTPException(404, "tank_not_found")
    allocs = await db.gs_tank_allocations.find({"tank_id": tank_id}, {"_id": 0}).to_list(500)
    return {"tank": _ser(tank), "allocations": [_ser(a) for a in allocs]}


@router.patch("/{tank_id}")
async def update_tank(tank_id: str, body: TankUpdate, user: dict = Depends(require_permission("gs.manage_tanks"))):
    db = get_gs_db()
    before = await db.gs_tanks.find_one({"id": tank_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "tank_not_found")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if "capacity" in updates:
        updates["capacity"] = _d128(_dec(updates["capacity"]))
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.gs_tanks.update_one({"id": tank_id}, {"$set": updates})
    after = await db.gs_tanks.find_one({"id": tank_id}, {"_id": 0})
    await write_audit(user_id=user["id"], action="update", module="tanks", document_id=tank_id, before=before, after=after)
    return _ser(after)


@router.post("/transfer")
async def transfer(body: TankTransfer, user: dict = Depends(require_permission("gs.post_stock", "gs.manage_tanks"))):
    db = get_gs_db()
    qty = _dec(body.quantity)
    if qty <= 0:
        raise HTTPException(422, "invalid_quantity")
    if body.source_tank_id == body.dest_tank_id:
        raise HTTPException(422, "same_tank")
    src = await db.gs_tanks.find_one({"id": body.source_tank_id, "active": True})
    dst = await db.gs_tanks.find_one({"id": body.dest_tank_id, "active": True})
    if not src or not dst:
        raise HTTPException(404, "tank_not_found")
    src_qty = _dec(src["quantity"].to_decimal() if hasattr(src["quantity"], "to_decimal") else src["quantity"])
    if qty > src_qty:
        raise HTTPException(409, "insufficient_stock")
    dst_qty = _dec(dst["quantity"].to_decimal() if hasattr(dst["quantity"], "to_decimal") else dst["quantity"])
    dst_cap = _dec(dst["capacity"].to_decimal() if hasattr(dst["capacity"], "to_decimal") else dst["capacity"])
    if dst_qty + qty > dst_cap:
        raise HTTPException(409, "destination_capacity_exceeded")
    allocs = await db.gs_tank_allocations.find({"tank_id": body.source_tank_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    remaining = qty
    moves = []
    for a in allocs:
        if remaining <= 0:
            break
        aq = _dec(a["quantity"].to_decimal() if hasattr(a["quantity"], "to_decimal") else a["quantity"])
        if aq <= 0:
            continue
        take = min(aq, remaining)
        moves.append({"material_code": a["material_code"], "quantity": take})
        remaining -= take
    if remaining > 0:
        raise HTTPException(409, "allocation_mismatch")
    now = datetime.now(timezone.utc)
    movement_id = str(uuid.uuid4())

    async def _tx(session):
        await db.gs_tanks.update_one({"id": body.source_tank_id}, {"$set": {"quantity": _d128(src_qty - qty)}}, session=session)
        await db.gs_tanks.update_one({"id": body.dest_tank_id}, {"$set": {"quantity": _d128(dst_qty + qty)}}, session=session)
        for m in moves:
            await db.gs_tank_allocations.update_one(
                {"tank_id": body.source_tank_id, "material_code": m["material_code"]},
                {"$inc": {"quantity": _d128(-m["quantity"])}}, session=session,
            )
            existing = await db.gs_tank_allocations.find_one(
                {"tank_id": body.dest_tank_id, "material_code": m["material_code"]}, session=session,
            )
            if existing:
                await db.gs_tank_allocations.update_one(
                    {"tank_id": body.dest_tank_id, "material_code": m["material_code"]},
                    {"$inc": {"quantity": _d128(m["quantity"])}}, session=session,
                )
            else:
                await db.gs_tank_allocations.insert_one({
                    "id": str(uuid.uuid4()), "tank_id": body.dest_tank_id,
                    "material_code": m["material_code"], "quantity": _d128(m["quantity"]),
                    "created_at": now,
                }, session=session)
            await db.gs_material_events.insert_one({
                "id": str(uuid.uuid4()), "material_code": m["material_code"],
                "event_type": "tank_transfer", "at": now, "user_id": user["id"],
                "quantity": _d128(m["quantity"]), "unit": "kg",
                "source": body.source_tank_id, "destination": body.dest_tank_id,
                "related_document": movement_id, "notes": body.notes,
            }, session=session)
        await db.gs_stock_movements.insert_one({
            "id": movement_id, "type": "transfer",
            "source_tank_id": body.source_tank_id, "dest_tank_id": body.dest_tank_id,
            "quantity": _d128(qty),
            "allocations": [{"material_code": m["material_code"], "quantity": str(m["quantity"])} for m in moves],
            "at": now, "user_id": user["id"], "notes": body.notes,
        }, session=session)

    await run_gs_transaction(_tx)
    await write_audit(
        user_id=user["id"], action="transfer", module="tanks", document_id=movement_id,
        after={"qty": str(qty), "from": body.source_tank_id, "to": body.dest_tank_id},
    )
    return {"ok": True, "movement_id": movement_id, "quantity": str(qty)}
