"""GS Purchases — creates permanent material code once (e.g. 2627A0008)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from bson import Decimal128

from gs.core.audit import write_audit
from gs.core.numbering import next_material_code
from gs.core.permissions import require_permission
from gs.core.seasons import require_season_for_numbering
from gs.database.connection import get_gs_db
from gs.database.transactions import run_gs_transaction

router = APIRouter(prefix="/purchases", tags=["gs-purchases"])


def _dec(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _d128(value: Decimal) -> Decimal128:
    return Decimal128(str(value))


class PurchaseCreate(BaseModel):
    supplier_id: str
    purchase_date: str = Field(description="ISO date YYYY-MM-DD")
    material_name: str = Field(default="Olives", max_length=200)
    quantity: str = Field(description="Decimal as string")
    unit: str = Field(default="kg", max_length=20)
    unit_price: str = Field(description="Decimal as string")
    notes: str = Field(default="", max_length=1000)
    payment_status: str = Field(default="unpaid")


@router.get("")
async def list_purchases(
    season: str = Query(""),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("gs.read", "gs.manage_purchases")),
):
    db = get_gs_db()
    filt: dict = {}
    if season:
        filt["season"] = season
    rows = await db.gs_purchases.find(filt, {"_id": 0}).sort("purchase_date", -1).to_list(limit)
    for r in rows:
        for k in ("quantity", "unit_price", "total_amount"):
            if k in r and hasattr(r[k], "to_decimal"):
                r[k] = str(r[k].to_decimal())
    return rows


@router.post("")
async def create_purchase(body: PurchaseCreate, user: dict = Depends(require_permission("gs.manage_purchases"))):
    db = get_gs_db()
    supplier = await db.gs_suppliers.find_one({"id": body.supplier_id, "active": True}, {"_id": 0})
    if not supplier:
        raise HTTPException(404, "supplier_not_found")
    qty = _dec(body.quantity)
    price = _dec(body.unit_price)
    if qty <= 0 or price < 0:
        raise HTTPException(422, "invalid_quantity_or_price")
    total = (qty * price).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    season_id, _ = await require_season_for_numbering()
    material_code, season_id = await next_material_code(season_id)
    purchase_id = str(uuid.uuid4())
    material_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    purchase_doc = {
        "id": purchase_id,
        "supplier_id": body.supplier_id,
        "supplier_name": supplier["name"],
        "purchase_date": body.purchase_date,
        "material_name": body.material_name.strip(),
        "material_code": material_code,
        "quantity": _d128(qty),
        "unit": body.unit,
        "unit_price": _d128(price),
        "total_amount": _d128(total),
        "payment_status": body.payment_status,
        "notes": body.notes.strip(),
        "season": season_id,
        "created_at": now,
        "created_by": user["id"],
    }
    material_doc = {
        "id": material_id,
        "material_code": material_code,
        "material_name": body.material_name.strip(),
        "supplier_id": body.supplier_id,
        "purchase_id": purchase_id,
        "quantity_initial": _d128(qty),
        "unit": body.unit,
        "season": season_id,
        "status": "purchased",
        "created_at": now,
        "created_by": user["id"],
    }
    event_doc = {
        "id": event_id,
        "material_code": material_code,
        "event_type": "purchase",
        "at": now,
        "user_id": user["id"],
        "quantity": _d128(qty),
        "unit": body.unit,
        "source": "supplier",
        "destination": "purchase",
        "related_document": purchase_id,
        "notes": body.notes.strip(),
        "season": season_id,
    }

    async def _tx(session):
        await db.gs_purchases.insert_one(purchase_doc, session=session)
        await db.gs_materials.insert_one(material_doc, session=session)
        await db.gs_material_events.insert_one(event_doc, session=session)

    try:
        await run_gs_transaction(_tx)
    except Exception as exc:
        raise HTTPException(500, f"purchase_transaction_failed:{exc}") from exc
    await write_audit(
        user_id=user["id"], action="create", module="purchases",
        document_id=purchase_id,
        after={"material_code": material_code, "purchase_id": purchase_id, "total": str(total)},
    )
    out = {**purchase_doc}
    out.pop("_id", None)
    for k in ("quantity", "unit_price", "total_amount"):
        out[k] = str(out[k].to_decimal()) if hasattr(out[k], "to_decimal") else str(out[k])
    return out


@router.get("/{purchase_id}")
async def get_purchase(purchase_id: str, user: dict = Depends(require_permission("gs.read", "gs.manage_purchases"))):
    db = get_gs_db()
    doc = await db.gs_purchases.find_one({"id": purchase_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "purchase_not_found")
    for k in ("quantity", "unit_price", "total_amount"):
        if k in doc and hasattr(doc[k], "to_decimal"):
            doc[k] = str(doc[k].to_decimal())
    return doc
