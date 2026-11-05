"""GS Sales — deduct stock from selected tank with FIFO source allocation."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from bson import Decimal128
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from gs.core.audit import write_audit
from gs.core.numbering import next_document_number
from gs.core.permissions import require_permission
from gs.core.seasons import require_season_for_numbering
from gs.database.connection import get_gs_db
from gs.database.transactions import run_gs_transaction

router = APIRouter(prefix="/sales", tags=["gs-sales"])


def _dec(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _d128(v: Decimal) -> Decimal128:
    return Decimal128(str(v))


def _ser(doc: dict) -> dict:
    for k, v in list(doc.items()):
        if hasattr(v, "to_decimal"):
            doc[k] = str(v.to_decimal())
        elif isinstance(v, list):
            doc[k] = [
                {kk: (str(vv.to_decimal()) if hasattr(vv, "to_decimal") else vv) for kk, vv in item.items()}
                if isinstance(item, dict) else item
                for item in v
            ]
    return doc


class SaleCreate(BaseModel):
    customer_id: str
    tank_id: str
    quantity: str
    unit_price: str
    sale_date: str = Field(description="YYYY-MM-DD")
    notes: str = Field(default="", max_length=1000)
    create_invoice: bool = True


@router.get("")
async def list_sales(
    customer_id: str = Query(""),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("gs.read", "gs.manage_sales")),
):
    db = get_gs_db()
    filt: dict = {}
    if customer_id:
        filt["customer_id"] = customer_id
    rows = await db.gs_sales.find(filt, {"_id": 0}).sort("sale_date", -1).to_list(limit)
    return [_ser(r) for r in rows]


@router.post("")
async def create_sale(body: SaleCreate, user: dict = Depends(require_permission("gs.manage_sales"))):
    db = get_gs_db()
    qty = _dec(body.quantity)
    price = _dec(body.unit_price)
    if qty <= 0 or price < 0:
        raise HTTPException(422, "invalid_quantity_or_price")
    total = (qty * price).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)

    customer = await db.gs_customers.find_one({"id": body.customer_id, "active": True}, {"_id": 0})
    if not customer:
        raise HTTPException(404, "customer_not_found")
    tank = await db.gs_tanks.find_one({"id": body.tank_id, "active": True})
    if not tank:
        raise HTTPException(404, "tank_not_found")

    tank_qty = _dec(tank["quantity"].to_decimal() if hasattr(tank["quantity"], "to_decimal") else tank["quantity"])
    if qty > tank_qty:
        raise HTTPException(409, "insufficient_stock")

    allocs = await db.gs_tank_allocations.find(
        {"tank_id": body.tank_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
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
        raise HTTPException(409, "allocation_mismatch_or_empty_tank")

    season_id, _ = await require_season_for_numbering()
    sale_number, season_id = await next_document_number("sale", season_id)
    sale_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    invoice_id = None
    invoice_number = None

    if body.create_invoice:
        from gs.core.numbering import next_invoice_number
        invoice_number, season_id = await next_invoice_number(season_id)
        invoice_id = str(uuid.uuid4())

    sale_doc = {
        "id": sale_id,
        "sale_number": sale_number,
        "customer_id": body.customer_id,
        "customer_name": customer["name"],
        "tank_id": body.tank_id,
        "tank_code": tank.get("code"),
        "quantity": _d128(qty),
        "unit": "kg",
        "unit_price": _d128(price),
        "total_amount": _d128(total),
        "sale_date": body.sale_date,
        "notes": body.notes.strip(),
        "season": season_id,
        "allocations": [
            {"material_code": m["material_code"], "quantity": _d128(m["quantity"])}
            for m in moves
        ],
        "invoice_id": invoice_id,
        "invoice_number": invoice_number,
        "created_at": now,
        "created_by": user["id"],
    }

    invoice_doc = None
    if invoice_id:
        invoice_doc = {
            "id": invoice_id,
            "invoice_number": invoice_number,
            "season": season_id,
            "customer_id": body.customer_id,
            "customer_name": customer["name"],
            "invoice_date": body.sale_date,
            "sale_id": sale_id,
            "lines": [
                {
                    "material_code": m["material_code"],
                    "quantity": _d128(m["quantity"]),
                    "unit_price": _d128(price),
                    "line_total": _d128((m["quantity"] * price).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)),
                }
                for m in moves
            ],
            "subtotal": _d128(total),
            "tax_amount": _d128(Decimal("0")),
            "total_amount": _d128(total),
            "amount_paid": _d128(Decimal("0")),
            "balance": _d128(total),
            "payment_status": "unpaid",
            "status": "issued",
            "created_at": now,
            "created_by": user["id"],
        }

    async def _tx(session):
        await db.gs_tanks.update_one(
            {"id": body.tank_id},
            {"$set": {"quantity": _d128(tank_qty - qty)}},
            session=session,
        )
        for m in moves:
            await db.gs_tank_allocations.update_one(
                {"tank_id": body.tank_id, "material_code": m["material_code"]},
                {"$inc": {"quantity": _d128(-m["quantity"])}},
                session=session,
            )
            await db.gs_material_events.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "material_code": m["material_code"],
                    "event_type": "sale",
                    "at": now,
                    "user_id": user["id"],
                    "quantity": _d128(m["quantity"]),
                    "unit": "kg",
                    "source": body.tank_id,
                    "destination": f"customer:{body.customer_id}",
                    "related_document": sale_id,
                    "notes": body.notes.strip(),
                    "season": season_id,
                },
                session=session,
            )
        await db.gs_stock_movements.insert_one(
            {
                "id": str(uuid.uuid4()),
                "type": "sale_out",
                "source_tank_id": body.tank_id,
                "dest_tank_id": None,
                "quantity": _d128(qty),
                "allocations": [
                    {"material_code": m["material_code"], "quantity": str(m["quantity"])}
                    for m in moves
                ],
                "at": now,
                "user_id": user["id"],
                "related_document": sale_id,
            },
            session=session,
        )
        await db.gs_sales.insert_one(sale_doc, session=session)
        if invoice_doc:
            await db.gs_invoices.insert_one(invoice_doc, session=session)

    await run_gs_transaction(_tx)
    await write_audit(
        user_id=user["id"], action="create", module="sales",
        document_id=sale_id,
        after={"sale_number": sale_number, "qty": str(qty), "invoice": invoice_number},
    )
    return _ser({k: v for k, v in sale_doc.items() if k != "_id"})


@router.get("/{sale_id}")
async def get_sale(sale_id: str, user: dict = Depends(require_permission("gs.read", "gs.manage_sales"))):
    db = get_gs_db()
    doc = await db.gs_sales.find_one({"id": sale_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "sale_not_found")
    return _ser(doc)
