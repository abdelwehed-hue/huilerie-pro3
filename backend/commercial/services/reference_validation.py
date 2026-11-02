"""Reference validation for stock movements; performs no writes."""
from __future__ import annotations

from typing import Any

# No commercial source-document collection is currently implemented. Keep
# this registry empty so a caller cannot post a movement against an invented
# or legacy document type. Add a type only alongside its real model/service.
SOURCE_DOCUMENT_COLLECTIONS: dict[str, str] = {\n    "ACH": "commercial_olive_purchases",\n}


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
        tank = await db["commercial_tanks"].find_one(
            {"id": location_id, "active": True}, {"_id": 0, "id": 1}, session=session
        )
        if not tank:
            raise ValueError(f"Unknown or inactive commercial tank: {location_id}")

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
