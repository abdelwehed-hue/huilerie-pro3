"""Read-only accounting overview assembled from existing source documents.

This endpoint deliberately does not write to operational collections or create a
second ledger. Source documents remain authoritative; payments are exposed
separately so the UI can distinguish purchases/revenue from settlement cash flow.
"""
from __future__ import annotations

import asyncio
from typing import Any

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends

from lib.auth import require_admin
from lib.db import db

router = APIRouter(prefix="/accounting", tags=["accounting"])


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


async def _recent(collection: str, sort_field: str = "created_at", limit: int = 5000):
    docs = await db[collection].find({}, {"_id": 0}).sort(sort_field, -1).to_list(limit)
    return _safe(docs)


@router.get("/overview")
async def accounting_overview(_: dict = Depends(require_admin)):
    """Read-only aggregation inputs for the admin accounting workspace."""
    invoices, olive_purchases, internal_movements, oil_purchases, sales_invoices, sale_payments, oil_payments, suppliers, owners = await asyncio.gather(
        _recent("invoices"),
        _recent("commercial_olive_purchases"),
        _recent("commercial_internal_movements"),
        _recent("commercial_oil_purchase_documents"),
        _recent("commercial_sales_invoices"),
        _recent("commercial_sale_payments"),
        _recent("commercial_oil_purchase_payments"),
        _recent("commercial_suppliers", "name", 1000),
        _recent("commercial_custody_owners", "client_name", 5000),
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
        "customer_oil_purchases": oil_purchases,
        "commercial_sales_invoices": sales_invoices,
        "commercial_sale_payments": sale_payments,
        "customer_oil_purchase_payments": oil_payments,
        "suppliers": suppliers,
        "accounting_basis": "SOURCE_DOCUMENTS_READ_ONLY",
    }
