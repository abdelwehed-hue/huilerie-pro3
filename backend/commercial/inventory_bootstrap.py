"""Provision the nine commercial tanks without creating stock."""
from pymongo import ASCENDING, DESCENDING, IndexModel
from commercial.services.numbering import validate_numbering_components

COMMERCIAL_DOCUMENT_TYPES = (
    "LOT", "MVT", "ACH", "PROD", "VTE", "FAC", "PAY", "INT", "RET", "AVO", "CIN", "CUS", "CAP", "REV", "RJT"
)


TANKS = tuple(
    {"id": f"tank-{n:02d}", "code": f"T{n:02d}", "name": f"Cuve {n:02d}",
     "active": True, "role": "NORMAL", "version": 1, "capacity_kg": None}
    for n in range(1, 10)
)

INVENTORY_INDEXES = {
    "commercial_counters": [
        IndexModel([("season_code", ASCENDING), ("document_type", ASCENDING)],
                   unique=True, name="uq_commercial_counter_season_type"),
    ],
    "commercial_suppliers": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_supplier_id"),
        IndexModel([("normalized_name", ASCENDING)], unique=True, name="uq_commercial_supplier_normalized_name"),
    ],
    "commercial_varieties": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_variety_id"),
        IndexModel([("code", ASCENDING)], unique=True, name="uq_commercial_variety_code"),
        IndexModel([("normalized_name_fr", ASCENDING)], unique=True, name="uq_commercial_variety_name_fr"),
    ],
    "commercial_custody_owners": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_custody_owner_id"),
        IndexModel([("legacy_client_id", ASCENDING)], unique=True, name="uq_custody_owner_legacy_client"),
        IndexModel([("client_phone", ASCENDING)], unique=True, name="uq_custody_owner_client_phone"),
        IndexModel([("active", ASCENDING), ("client_name", ASCENDING)], name="custody_owner_active_name"),
    ],
    "commercial_customer_custody_receipts": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_customer_custody_receipt_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_customer_custody_receipt_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_customer_custody_receipt_idempotency"),
        IndexModel([("customer_id", ASCENDING), ("receipt_date", DESCENDING)], name="customer_custody_receipt_customer_date"),
    ],
    "commercial_customer_custody_releases": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_customer_custody_release_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_customer_custody_release_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_customer_custody_release_idempotency"),
        IndexModel([("customer_id", ASCENDING), ("release_date", DESCENDING)], name="customer_custody_release_customer_date"),
        IndexModel([("oil_lot_id", ASCENDING), ("created_at", DESCENDING)], name="customer_custody_release_lot_created"),
    ],
    "commercial_olive_purchases": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_olive_purchase_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_olive_purchase_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_olive_purchase_idempotency"),
        IndexModel([("supplier_id", ASCENDING), ("purchase_date", DESCENDING)],
                   name="olive_purchase_supplier_date"),
    ],
    "commercial_production_runs": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_production_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_commercial_production_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_commercial_production_idempotency"),
        IndexModel([("production_date", DESCENDING)], name="commercial_production_date"),
    ],
    "commercial_buyers": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_buyer_id"),
        IndexModel([("normalized_name", ASCENDING)], unique=True, name="uq_commercial_buyer_normalized_name"),
        IndexModel([("active", ASCENDING), ("name", ASCENDING)], name="commercial_buyer_active_name"),
    ],
    "commercial_sales": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_sale_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_commercial_sale_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_commercial_sale_idempotency"),
        IndexModel([("buyer_id", ASCENDING), ("sale_date", DESCENDING)], name="commercial_sale_buyer_date"),
    ],
    "commercial_sale_returns": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_sale_return_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_commercial_sale_return_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_commercial_sale_return_idempotency"),
        IndexModel([("sale_id", ASCENDING), ("created_at", DESCENDING)],
                   name="commercial_sale_return_sale_created"),
    ],
    "commercial_sale_return_rejections": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_sale_return_rejection_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_commercial_sale_return_rejection_document"),
        IndexModel([("return_id", ASCENDING)], unique=True, name="uq_commercial_sale_return_rejection_return"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_commercial_sale_return_rejection_idempotency"),
    ],
    "commercial_sales_invoices": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_sales_invoice_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_commercial_sales_invoice_document"),
        IndexModel([("sale_id", ASCENDING)], unique=True, name="uq_commercial_sales_invoice_sale"),
    ],
    "commercial_credit_notes": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_credit_note_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_commercial_credit_note_document"),
        IndexModel([("return_id", ASCENDING)], unique=True, name="uq_commercial_credit_note_return"),
    ],
    "commercial_buyer_return_rejections": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_buyer_return_rejection_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_buyer_return_rejection_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_buyer_return_rejection_idempotency"),
        IndexModel([("return_id", ASCENDING)], unique=True, name="uq_buyer_return_rejection_return"),
        IndexModel([("sale_id", ASCENDING), ("created_at", DESCENDING)], name="buyer_return_rejection_sale_created"),
    ],
    "commercial_payment_reversals": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_payment_reversal_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_payment_reversal_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_payment_reversal_idempotency"),
        IndexModel([("payment_id", ASCENDING), ("created_at", ASCENDING)], name="payment_reversal_payment_created"),
        IndexModel([("invoice_id", ASCENDING), ("created_at", DESCENDING)], name="payment_reversal_invoice_created"),
    ],
    "commercial_buyer_credit_applications": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_buyer_credit_application_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_buyer_credit_application_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_buyer_credit_application_idempotency"),
        IndexModel([("buyer_id", ASCENDING), ("created_at", DESCENDING)], name="buyer_credit_application_buyer_created"),
        IndexModel([("target_invoice_id", ASCENDING), ("created_at", DESCENDING)], name="buyer_credit_application_invoice_created"),
    ],
    "commercial_buyer_credit_ledger": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_buyer_credit_entry_id"),
        IndexModel([("credit_note_id", ASCENDING)], unique=True,
                   partialFilterExpression={"credit_note_id": {"$type": "string"}},
                   name="uq_buyer_credit_entry_credit_note"),
        IndexModel([("source_document_type", ASCENDING), ("source_document_id", ASCENDING),
                    ("source_credit_note_id", ASCENDING)], unique=True,
                   partialFilterExpression={"source_document_type": {"$type": "string"}},
                   name="uq_buyer_credit_adjustment_source"),
        IndexModel([("source_credit_note_id", ASCENDING), ("created_at", ASCENDING)],
                   name="buyer_credit_ledger_source_note_created"),
        IndexModel([("buyer_id", ASCENDING), ("created_at", DESCENDING)],
                   name="buyer_credit_ledger_buyer_created"),
    ],
    "commercial_sale_payments": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_sale_payment_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)], unique=True, name="uq_commercial_sale_payment_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="uq_commercial_sale_payment_idempotency"),
        IndexModel([("invoice_id", ASCENDING), ("payment_date", DESCENDING)], name="commercial_sale_payment_invoice_date"),
    ],
    "commercial_locations": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_location_id"),
        IndexModel([("code", ASCENDING)], unique=True, name="uq_commercial_location_code"),
        IndexModel([("kind", ASCENDING), ("active", ASCENDING)],
                   name="commercial_location_kind_active"),
    ],
    "commercial_tanks": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_tank_id"),
        IndexModel([("code", ASCENDING)], unique=True, name="uq_commercial_tank_code"),
    ],
    "commercial_lots": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_lot_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_commercial_lot_document"),
    ],
    "commercial_quality_assessments": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_quality_assessment_id"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_quality_assessment_idempotency"),
        IndexModel([("oil_lot_id", ASCENDING), ("created_at", DESCENDING)],
                   name="quality_assessment_lot_created"),
    ],
    "commercial_quality_releases": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_quality_release_id"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_quality_release_idempotency"),
        IndexModel([("assessment_id", ASCENDING)], unique=True, name="uq_quality_release_assessment"),
        IndexModel([("oil_lot_id", ASCENDING), ("created_at", DESCENDING)],
                   name="quality_release_lot_created"),
    ],
    "commercial_internal_movements": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_internal_movement_id"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_internal_movement_idempotency"),
        IndexModel([("season_code", ASCENDING), ("created_at", DESCENDING)],
                   name="internal_movement_season_created"),
    ],
    "commercial_stock_movements": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_stock_movement_id"),
        IndexModel([("season_code", ASCENDING), ("document_number", ASCENDING)],
                   unique=True, name="uq_stock_movement_document"),
        IndexModel([("idempotency_scope", ASCENDING), ("idempotency_key", ASCENDING)],
                   unique=True, name="uq_stock_movement_idempotency"),
        IndexModel([("lot_id", ASCENDING), ("created_at", DESCENDING)],
                   name="stock_movement_lot_created"),
    ],
    "commercial_stock_balances": [
        IndexModel([("product_kind", ASCENDING), ("lot_id", ASCENDING),
                    ("owner.kind", ASCENDING), ("owner.customer_id", ASCENDING),
                    ("location_id", ASCENDING)],
                   unique=True, name="uq_stock_balance_identity"),
    ],
    "commercial_audit_events": [
        IndexModel([("id", ASCENDING)], unique=True, name="uq_commercial_audit_id"),
        IndexModel([("entity_type", ASCENDING), ("entity_id", ASCENDING),
                    ("created_at", DESCENDING)], name="commercial_audit_entity_created"),
    ],
}


async def ensure_inventory_indexes(db):
    """Create critical indexes; any failure must prevent commercial activation."""
    for collection, indexes in INVENTORY_INDEXES.items():
        await db[collection].create_indexes(indexes)


async def provision_nine_tanks(db):
    """Idempotently insert stable tank identities; never overwrite existing metadata."""
    collection = db["commercial_tanks"]
    await collection.create_indexes(INVENTORY_INDEXES["commercial_tanks"])
    for tank in TANKS:
        await collection.update_one(
            {"id": tank["id"]}, {"$setOnInsert": tank}, upsert=True
        )
    result = await collection.find(
        {"id": {"$in": [tank["id"] for tank in TANKS]}}, {"_id": 0}
    ).sort("code", ASCENDING).to_list(length=9)
    if len(result) != 9 or {item.get("code") for item in result} != {
        tank["code"] for tank in TANKS
    }:
        raise RuntimeError("Commercial tank provisioning verification failed")
    return result


async def provision_commercial_counters(db, season_code, document_types=COMMERCIAL_DOCUMENT_TYPES):
    """Initialize zero-based counters for one validated four-digit season.

    This is an explicit bootstrap operation, not part of document issuance.
    Existing counters are never reset or decremented.
    """
    validate_numbering_components(season_code, "LOT")
    document_types = tuple(document_types)
    for document_type in document_types:
        if not isinstance(document_type, str) or document_type not in COMMERCIAL_DOCUMENT_TYPES:
            raise ValueError(f"Unsupported commercial document type: {document_type!r}")
    if len(document_types) != len(set(document_types)):
        raise ValueError("Commercial document types must be unique")
    collection = db["commercial_counters"]
    await collection.create_indexes(INVENTORY_INDEXES["commercial_counters"])
    for document_type in document_types:
        await collection.update_one(
            {"season_code": season_code, "document_type": document_type},
            {"$setOnInsert": {
                "season_code": season_code,
                "document_type": document_type,
                "last_sequence": 0,
            }},
            upsert=True,
        )
    return len(document_types)
