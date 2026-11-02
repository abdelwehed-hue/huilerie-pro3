"""Reference validation for stock movements; performs no writes."""
from __future__ import annotations

from typing import Any

# Register only document types backed by real commercial collections/services.
# Legacy pressing loads and service invoices are intentionally excluded.
SOURCE_DOCUMENT_COLLECTIONS: dict[str, str] = {
    "ACH": "commercial_olive_purchases",
    "PROD": "commercial_production_runs",
    "INT": "commercial_internal_movements",
    "VTE": "commercial_sales",
}


async def validate_stock_references(db: Any, draft: Any, *, session: Any) -> None:
    lot = await db["commercial_lots"].find_one(
        {"id": draft.lot_id}, {"_id": 0, "id": 1}, session=session
    )
    if not lot:
        raise ValueError("Unknown commercial lot")

    location_ids = {
        value for value in (draft.source_location_id, draft.destination_location_id)
        if value is not None
    }
    for location_id in location_ids:
        if draft.product_kind == "OIL":
            location = await db["commercial_tanks"].find_one(
                {"id": location_id, "active": True}, {"_id": 0, "id": 1}, session=session
            )
            location_label = "commercial tank"
        else:
            location = await db["commercial_locations"].find_one(
                {"id": location_id, "active": True, "kind": {"$in": ["OLIVE_STORAGE", "STAGING"]}},
                {"_id": 0, "id": 1}, session=session
            )
            location_label = "olive storage location"
        if not location:
            raise ValueError(f"Unknown or inactive {location_label}: {location_id}")

    for owner in (draft.source_owner, draft.destination_owner):
        if owner is None or owner.kind != "CUSTOMER":
            continue
        customer = await db["clients"].find_one(
            {"id": owner.customer_id}, {"_id": 0, "id": 1}, session=session
        )
        if not customer:
            raise ValueError(f"Unknown customer owner: {owner.customer_id}")

    collection_name = SOURCE_DOCUMENT_COLLECTIONS.get(draft.source_document_type)
    if not collection_name:
        raise ValueError(
            f"Unsupported source document type: {draft.source_document_type}"
        )
    source = await db[collection_name].find_one(
        {"id": draft.source_document_id}, {"_id": 0, "id": 1, "status": 1},
        session=session,
    )
    if not source:
        raise ValueError("Source document does not exist")
    if source.get("status") not in {"APPROVED", "COMPLETED"}:
        raise ValueError("Source document is not approved for stock posting")
