"""Read-only accounting overview assembled from authoritative source documents.

Financial totals are aggregated over complete collections. Recent-document lists are
intentionally capped for display only and must never be used to calculate totals.
"""
from __future__ import annotations

import asyncio
from typing import Any

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends

from lib.auth import require_admin
from lib.db import db

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


async def _recent(collection: str, sort_field: str = "created_at", limit: int = RECENT_LIMIT):
    docs = await db[collection].find({}, {"_id": 0}).sort(sort_field, -1).to_list(limit)
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
    """Sum a numeric/Decimal128/string field server-side across every matching record."""
    rows = await db[collection].aggregate(_sum_pipeline(field, match)).to_list(1)
    # Keep Decimal128 precision across the API boundary; the UI formats this string.
    return rows[0]["total"] if rows else "0.000"


@router.get("/overview")
async def accounting_overview(_: dict = Depends(require_admin)):
    """Read-only complete totals plus a bounded sample of recent source documents."""
    (
        invoices, olive_purchases, internal_movements, oil_purchases,
        sales_invoices, sale_payments, oil_payments, credit_notes, suppliers, owners,
        pressing_revenue, pressing_collected, gs_sales_revenue, gs_collected,
        supplier_olive_total, customer_olive_total, customer_olive_paid, customer_oil_total, customer_oil_paid,
    ) = await asyncio.gather(
        _recent("invoices", "day"),
        _recent("commercial_olive_purchases"),
        _recent("commercial_internal_movements"),
        _recent("commercial_oil_purchase_documents"),
        _recent("commercial_sales_invoices"),
        _recent("commercial_sale_payments"),
        _recent("commercial_oil_purchase_payments"),
        _recent("commercial_credit_notes"),
        _recent("commercial_suppliers", "name", 1000),
        _recent("commercial_custody_owners", "client_name", 5000),
        _sum("invoices", "total"),
        _sum("invoices", "paid_amount"),
        _sum("commercial_sales_invoices", "net_amount_dt"),
        _sum("commercial_sales_invoices", "paid_amount_dt"),
        _sum("commercial_olive_purchases", "total_amount_dt", {"status": "APPROVED"}),
        # Customer olive purchases are counted from their BAH documents, not
        # from the ownership-transfer record, to avoid counting one purchase twice.
        _sum("commercial_oil_purchase_documents", "agreed_amount_tnd", {"product_kind": "OLIVE"}),
        _sum("commercial_oil_purchase_payments", "amount_tnd", {"product_kind": "OLIVE"}),
        _sum("commercial_oil_purchase_documents", "agreed_amount_tnd", {
            "$or": [{"product_kind": "OIL"}, {"product_kind": {"$exists": False}}],
        }),
        _sum("commercial_oil_purchase_payments", "amount_tnd", {
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
        "accounting_basis": "SOURCE_DOCUMENTS_READ_ONLY",
    }
