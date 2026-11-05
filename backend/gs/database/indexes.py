"""GS indexes — independent of main app collections."""
from __future__ import annotations

import logging

from pymongo import ASCENDING, DESCENDING, IndexModel

from gs.database.connection import get_gs_db

logger = logging.getLogger(__name__)

INDEXES: dict[str, list[IndexModel]] = {
    "gs_counters": [
        IndexModel([("_id", ASCENDING)], name="id"),
    ],
    "gs_materials": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("material_code", ASCENDING)], name="material_code", unique=True),
        IndexModel([("season", ASCENDING), ("created_at", DESCENDING)], name="season_created"),
        IndexModel([("supplier_id", ASCENDING)], name="supplier_id"),
    ],
    "gs_material_events": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("material_code", ASCENDING), ("at", ASCENDING)], name="code_at"),
        IndexModel([("event_type", ASCENDING), ("at", DESCENDING)], name="type_at"),
    ],
    "gs_customers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("phone", ASCENDING)], name="phone"),
        IndexModel([("name", ASCENDING)], name="name"),
    ],
    "gs_suppliers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("phone", ASCENDING)], name="phone"),
        IndexModel([("name", ASCENDING)], name="name"),
    ],
    "gs_receptions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("material_code", ASCENDING)], name="material_code"),
        IndexModel([("reception_date", DESCENDING)], name="reception_date"),
    ],
    "gs_purchases": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("material_code", ASCENDING)], name="material_code"),
        IndexModel([("season", ASCENDING), ("purchase_date", DESCENDING)], name="season_date"),
        IndexModel([("supplier_id", ASCENDING)], name="supplier_id"),
    ],
    "gs_tanks": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code", unique=True),
    ],
    "gs_tank_allocations": [
        IndexModel([("tank_id", ASCENDING), ("material_code", ASCENDING)], name="tank_material", unique=True),
        IndexModel([("material_code", ASCENDING)], name="material_code"),
    ],
    "gs_stock_movements": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("tank_id", ASCENDING), ("at", DESCENDING)], name="tank_at"),
        IndexModel([("material_code", ASCENDING), ("at", DESCENDING)], name="material_at"),
    ],
    "gs_sales": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("customer_id", ASCENDING), ("sale_date", DESCENDING)], name="customer_date"),
        IndexModel([("season", ASCENDING)], name="season"),
    ],
    "gs_invoices": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("invoice_number", ASCENDING)], name="invoice_number", unique=True),
        IndexModel([("customer_id", ASCENDING)], name="customer_id"),
        IndexModel([("season", ASCENDING), ("invoice_date", DESCENDING)], name="season_date"),
    ],
    "gs_payments": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("customer_id", ASCENDING), ("paid_at", DESCENDING)], name="customer_paid"),
        IndexModel([("invoice_id", ASCENDING)], name="invoice_id"),
    ],
    "gs_returns": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("sale_id", ASCENDING)], name="sale_id"),
        IndexModel([("material_code", ASCENDING)], name="material_code"),
    ],
    "gs_quality": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("material_code", ASCENDING), ("analyzed_at", DESCENDING)], name="code_analyzed"),
    ],
    "gs_production": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("season", ASCENDING), ("produced_at", DESCENDING)], name="season_produced"),
    ],
    "gs_users_permissions": [
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
    ],
    "gs_audit": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("at", DESCENDING)], name="at_desc"),
        IndexModel([("module", ASCENDING), ("at", DESCENDING)], name="module_at"),
        IndexModel([("user_id", ASCENDING), ("at", DESCENDING)], name="user_at"),
    ],
}


async def ensure_gs_indexes() -> None:
    db = get_gs_db()
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("GS ensure_indexes(%s.%s): %s", collection, model.document.get("name"), exc)
