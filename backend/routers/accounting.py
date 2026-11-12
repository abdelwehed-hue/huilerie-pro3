"""Read-only accounting overview scoped to the active olive season.

Financial totals are aggregated from authoritative source documents for the active
season only. Recent-document lists are bounded for display and never drive totals.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import uuid4

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.auth import require_admin
from lib.db import db
from lib.season import active_season, season_prefix

router = APIRouter(prefix="/accounting", tags=["accounting"])
RECENT_LIMIT = 200


def _safe(value: Any) -> Any:
    if isinstance(value, Decimal128):
        return str(value.to_decimal())
    if isinstance(value, dict):
        return {key: _safe(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, list):
        return [_safe(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


async def _recent(
    collection: str, sort_field: str = "created_at",
    limit: int = RECENT_LIMIT, match: dict | None = None,
):
    docs = await db[collection].find(match or {}, {"_id": 0}).sort(sort_field, -1).to_list(limit)
    return _safe(docs)


def _sum_pipeline(field: str, match: dict | None = None) -> list[dict]:
    """Build a Decimal128 aggregation; never route money through binary float."""
    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline.extend([
        {"$group": {"_id": None, "total": {"$sum": {
            "$convert": {"input": f"${field}", "to": "decimal", "onError": 0, "onNull": 0}
        }}}},
        {"$project": {"_id": 0, "total": {"$toString": "$total"}}},
    ])
    return pipeline


async def _sum(collection: str, field: str, match: dict | None = None) -> str:
    """Sum a numeric/Decimal128/string field server-side across matching records."""
    rows = await db[collection].aggregate(_sum_pipeline(field, match)).to_list(1)
    return rows[0]["total"] if rows else "0.000"


@router.get("/overview")
async def accounting_overview(_: dict = Depends(require_admin)):
    """Read-only totals and recent source documents for the active season only."""
    season = await active_season()
    season_code = season_prefix(season)
    commercial_match = {"season_code": season_code}

    # Traditional invoices predate season_code. Their authoritative season is
    # the season_id on the source olive load, so join by its load_id.
    seasonal_load_ids = await db.loads.distinct("id", {"season_id": season})
    invoice_match = {"load_id": {"$in": seasonal_load_ids}}

    (
        invoices, olive_purchases, internal_movements, oil_purchases,
        sales_invoices, sale_payments, oil_payments, credit_notes, suppliers, owners,
        pressing_revenue, pressing_collected, gs_sales_revenue, gs_collected,
        supplier_olive_total, customer_olive_total, customer_olive_paid, customer_oil_total, customer_oil_paid,
    ) = await asyncio.gather(
        _recent("invoices", "day", match=invoice_match),
        _recent("commercial_olive_purchases", match=commercial_match),
        _recent("commercial_internal_movements", match=commercial_match),
        _recent("commercial_oil_purchase_documents", match=commercial_match),
        _recent("commercial_sales_invoices", match=commercial_match),
        _recent("commercial_sale_payments", match=commercial_match),
        _recent("commercial_oil_purchase_payments", match=commercial_match),
        _recent("commercial_credit_notes", match=commercial_match),
        _recent("commercial_suppliers", "name", 1000),
        _recent("commercial_custody_owners", "client_name", 5000),
        _sum("invoices", "total", invoice_match),
        _sum("invoices", "paid_amount", invoice_match),
        _sum("commercial_sales_invoices", "net_amount_dt", commercial_match),
        _sum("commercial_sales_invoices", "paid_amount_dt", commercial_match),
        _sum("commercial_olive_purchases", "total_amount_dt", {**commercial_match, "status": "APPROVED"}),
        _sum("commercial_oil_purchase_documents", "agreed_amount_tnd", {
            **commercial_match, "product_kind": "OLIVE",
        }),
        _sum("commercial_oil_purchase_payments", "amount_tnd", {
            **commercial_match, "product_kind": "OLIVE",
        }),
        _sum("commercial_oil_purchase_documents", "agreed_amount_tnd", {
            **commercial_match,
            "$or": [{"product_kind": "OIL"}, {"product_kind": {"$exists": False}}],
        }),
        _sum("commercial_oil_purchase_payments", "amount_tnd", {
            **commercial_match,
            "$or": [{"product_kind": "OIL"}, {"product_kind": {"$exists": False}}],
        }),
    )
    supplier_names = {str(item.get("id")): item.get("name") for item in suppliers}
    owner_names = {str(item.get("id")): item.get("client_name") for item in owners}
    for purchase in olive_purchases:
        purchase["supplier_name"] = supplier_names.get(str(purchase.get("supplier_id")))
    for movement in internal_movements:
        source_owner = movement.get("source_owner") or {}
        movement["customer_name"] = owner_names.get(str(source_owner.get("customer_id")))

    return {
        "active_season": season,
        "season_code": season_code,
        "traditional_invoices": invoices,
        "supplier_olive_purchases": olive_purchases,
        "customer_ownership_transfers": internal_movements,
        "customer_olive_purchases": [item for item in oil_purchases if item.get("product_kind") == "OLIVE"],
        "customer_oil_purchases": [item for item in oil_purchases if item.get("product_kind", "OIL") == "OIL"],
        "commercial_sales_invoices": sales_invoices,
        "commercial_sale_payments": sale_payments,
        "customer_olive_purchase_payments": [item for item in oil_payments if item.get("product_kind") == "OLIVE"],
        "customer_oil_purchase_payments": [item for item in oil_payments if item.get("product_kind", "OIL") == "OIL"],
        "commercial_credit_notes": credit_notes,
        "suppliers": suppliers,
        "summary": {
            "pressing_revenue_total": pressing_revenue,
            "pressing_collected_total": pressing_collected,
            "gs_sales_revenue_total": gs_sales_revenue,
            "gs_sales_collected_total": gs_collected,
            "supplier_olive_purchase_total": supplier_olive_total,
            "customer_olive_purchase_total": customer_olive_total,
            "customer_olive_paid_total": customer_olive_paid,
            "customer_oil_purchase_total": customer_oil_total,
            "customer_oil_paid_total": customer_oil_paid,
        },
        "recent_limit": RECENT_LIMIT,
        "accounting_basis": "ACTIVE_SEASON_SOURCE_DOCUMENTS_READ_ONLY",
    }


class PassiveIncomeInput(BaseModel):
    income_type: Literal["RENT", "EQUIPMENT_RENTAL", "INTEREST", "INVESTMENT", "OTHER"]
    description: str = Field(min_length=2, max_length=180)
    income_date: str = Field(pattern=r"^\\d{4}-\\d{2}-\\d{2}$")
    amount_tnd: str = Field(pattern=r"^\\d{1,12}(?:\\.\\d{1,3})?$")
    payment_method: Literal["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"] = "CASH"
    notes: str = Field(default="", max_length=500)


@router.get("/passive-incomes")
async def list_passive_incomes(_: dict = Depends(require_admin)):
    season = await active_season()
    rows = await db.accounting_passive_incomes.find(
        {"season": season}, {"_id": 0}
    ).sort([("income_date", -1), ("created_at", -1)]).to_list(1000)
    return _safe(rows)


@router.post("/passive-incomes")
async def create_passive_income(payload: PassiveIncomeInput, user: dict = Depends(require_admin)):
    season = await active_season()
    try:
        datetime.strptime(payload.income_date, "%Y-%m-%d")
        amount = Decimal(payload.amount_tnd)
    except (ValueError, InvalidOperation):
        raise HTTPException(status_code=422, detail="Date ou montant invalide.")
    if not amount.is_finite() or amount <= 0:
        raise HTTPException(status_code=422, detail="Le montant doit être supérieur à zéro.")
    record = {
        "id": str(uuid4()),
        "season": season,
        "income_type": payload.income_type,
        "description": payload.description.strip(),
        "income_date": payload.income_date,
        "amount_tnd": format(amount.quantize(Decimal("0.001")), "f"),
        "payment_method": payload.payment_method,
        "notes": payload.notes.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("id") or user.get("username") or "admin",
    }
    await db.accounting_passive_incomes.insert_one(record)
    record.pop("_id", None)
    return record


@router.delete("/passive-incomes/{income_id}")
async def delete_passive_income(income_id: str, _: dict = Depends(require_admin)):
    season = await active_season()
    result = await db.accounting_passive_incomes.delete_one({"id": income_id, "season": season})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Revenu passif introuvable pour la saison active.")
    return {"ok": True}
