"""GS Invoices — independent numbering 2627F0001; Decimal128; no silent delete."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from bson import Decimal128
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from gs.core.audit import write_audit
from gs.core.numbering import next_invoice_number
from gs.core.permissions import require_permission
from gs.core.seasons import require_season_for_numbering
from gs.database.connection import get_gs_db
from gs.database.transactions import run_gs_transaction

router = APIRouter(prefix="/invoices", tags=["gs-invoices"])


def _dec(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _d128(v: Decimal) -> Decimal128:
    return Decimal128(str(v))


def _ser(doc: dict) -> dict:
    for k, v in list(doc.items()):
        if hasattr(v, "to_decimal"):
            doc[k] = str(v.to_decimal())
        elif isinstance(v, list):
            doc[k] = [_ser(dict(item)) if isinstance(item, dict) else item for item in v]
    return doc


class InvoiceLineIn(BaseModel):
    material_code: str
    quantity: str
    unit_price: str
    description: str = ""


class InvoiceCreate(BaseModel):
    customer_id: str
    invoice_date: str
    lines: list[InvoiceLineIn] = Field(min_length=1)
    notes: str = Field(default="", max_length=1000)
    tax_rate: str = Field(default="0")


class InvoiceCancel(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.get("")
async def list_invoices(
    customer_id: str = Query(""),
    season: str = Query(""),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_permission("gs.read", "gs.manage_invoices")),
):
    db = get_gs_db()
    filt: dict = {}
    if customer_id:
        filt["customer_id"] = customer_id
    if season:
        filt["season"] = season
    rows = await db.gs_invoices.find(filt, {"_id": 0}).sort("invoice_date", -1).to_list(limit)
    return [_ser(r) for r in rows]


@router.post("")
async def create_invoice(body: InvoiceCreate, user: dict = Depends(require_permission("gs.manage_invoices"))):
    db = get_gs_db()
    customer = await db.gs_customers.find_one({"id": body.customer_id, "active": True}, {"_id": 0})
    if not customer:
        raise HTTPException(404, "customer_not_found")
    lines = []
    subtotal = Decimal("0")
    for line in body.lines:
        q = _dec(line.quantity)
        p = _dec(line.unit_price)
        if q <= 0 or p < 0:
            raise HTTPException(422, "invalid_line")
        lt = (q * p).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        subtotal += lt
        lines.append({
            "material_code": line.material_code.strip().upper(),
            "description": line.description.strip(),
            "quantity": _d128(q),
            "unit_price": _d128(p),
            "line_total": _d128(lt),
        })
    tax_rate = _dec(body.tax_rate)
    tax_amount = (subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    total = subtotal + tax_amount
    season_id, _ = await require_season_for_numbering()
    invoice_number, season_id = await next_invoice_number(season_id)
    invoice_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": invoice_id,
        "invoice_number": invoice_number,
        "season": season_id,
        "customer_id": body.customer_id,
        "customer_name": customer["name"],
        "invoice_date": body.invoice_date,
        "sale_id": None,
        "lines": lines,
        "subtotal": _d128(subtotal),
        "tax_rate": str(tax_rate),
        "tax_amount": _d128(tax_amount),
        "total_amount": _d128(total),
        "amount_paid": _d128(Decimal("0")),
        "balance": _d128(total),
        "payment_status": "unpaid",
        "status": "issued",
        "notes": body.notes.strip(),
        "created_at": now,
        "created_by": user["id"],
    }
    await db.gs_invoices.insert_one(doc)
    await write_audit(
        user_id=user["id"], action="create", module="invoices",
        document_id=invoice_id, after={"invoice_number": invoice_number, "total": str(total)},
    )
    return _ser({k: v for k, v in doc.items() if k != "_id"})


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(require_permission("gs.read", "gs.manage_invoices"))):
    db = get_gs_db()
    doc = await db.gs_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "invoice_not_found")
    return _ser(doc)


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: dict = Depends(require_permission("gs.read", "gs.manage_invoices"))):
    db = get_gs_db()
    inv = await db.gs_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "invoice_not_found")
    inv = _ser(inv)
    lines_html = "".join(
        f"<tr><td>{ln.get('material_code','')}</td><td>{ln.get('description','')}</td>"
        f"<td style='text-align:right'>{ln.get('quantity','')}</td>"
        f"<td style='text-align:right'>{ln.get('unit_price','')}</td>"
        f"<td style='text-align:right'>{ln.get('line_total','')}</td></tr>"
        for ln in (inv.get("lines") or [])
    )
    html = f"""<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Facture {inv.get('invoice_number')}</title>
<style>body{{font-family:Arial,sans-serif;padding:24px}}table{{width:100%;border-collapse:collapse;margin-top:16px}}
th,td{{border:1px solid #ccc;padding:8px;font-size:13px}}th{{background:#ecfdf5}}.totals{{margin-top:16px;text-align:right}}</style></head><body>
<h1 style=\"color:#047857\">FACTURE {inv.get('invoice_number')}</h1>
<p>Date: {inv.get('invoice_date')} · Saison: {inv.get('season')}<br>Client: <strong>{inv.get('customer_name')}</strong></p>
<table><thead><tr><th>Code</th><th>Description</th><th>Qté</th><th>P.U.</th><th>Total</th></tr></thead><tbody>{lines_html}</tbody></table>
<div class=\"totals\"><p>Sous-total: {inv.get('subtotal')} · Taxe: {inv.get('tax_amount')}<br>
<strong style=\"font-size:1.2rem\">TOTAL: {inv.get('total_amount')}</strong><br>
Payé: {inv.get('amount_paid')} · Solde: {inv.get('balance')}</p></div>
<script>window.onload=function(){{setTimeout(function(){{window.print()}},300)}}</script></body></html>"""
    return Response(content=html, media_type="text/html; charset=utf-8")


@router.post("/{invoice_id}/cancel")
async def cancel_invoice(invoice_id: str, body: InvoiceCancel, user: dict = Depends(require_permission("gs.manage_invoices"))):
    db = get_gs_db()
    before = await db.gs_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "invoice_not_found")
    if before.get("status") == "cancelled":
        raise HTTPException(409, "already_cancelled")
    paid = before.get("amount_paid", 0)
    paid_dec = _dec(paid.to_decimal() if hasattr(paid, "to_decimal") else paid)
    if paid_dec > 0:
        raise HTTPException(409, "cannot_cancel_with_payments")
    now = datetime.now(timezone.utc)

    async def _tx(session):
        await db.gs_invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "status": "cancelled", "payment_status": "cancelled",
                "cancelled_at": now, "cancelled_by": user["id"],
                "cancel_reason": body.reason.strip(),
            }},
            session=session,
        )

    await run_gs_transaction(_tx)
    after = await db.gs_invoices.find_one({"id": invoice_id}, {"_id": 0})
    await write_audit(
        user_id=user["id"], action="cancel", module="invoices",
        document_id=invoice_id, before=before, after=after, reason=body.reason.strip(),
    )
    return _ser(after)
