"""Reference validation for stock movements; serializes tank access transactionally."""
from __future__ import annotations

from typing import Any

from decimal import Decimal
from bson.decimal128 import Decimal128

# Register only document types backed by real commercial collections/services.
# Legacy pressing loads and service invoices are intentionally excluded.
SOURCE_DOCUMENT_COLLECTIONS: dict[str, str] = {
    "ACH": "commercial_olive_purchases",
    "PROD": "commercial_production_runs",
    "INT": "commercial_internal_movements",
    "VTE": "commercial_sales",
    "RET": "commercial_sale_returns",
    "CIN": "commercial_customer_custody_receipts",
    "CUS": "commercial_customer_custody_releases",
    "RJT": "commercial_sale_return_rejections",
}


def _quantity(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value or "0"))


async def validate_stock_references(db: Any, draft: Any, *, session: Any) -> None:
    lot = await db["commercial_lots"].find_one(
        {"id": draft.lot_id}, {"_id": 0, "id": 1, "product_kind": 1}, session=session
    )
    if not lot:
        raise ValueError("Unknown commercial lot")
    if lot.get("product_kind") != draft.product_kind:
        raise ValueError(
            f"Stock movement product kind {draft.product_kind} does not match "
            f"lot product kind {lot.get('product_kind')}"
        )

    location_ids = {
        value for value in (draft.source_location_id, draft.destination_location_id)
        if value is not None
    }
    for location_id in location_ids:
        if draft.product_kind == "OIL":
            location = await db["commercial_tanks"].find_one(
                {"id": location_id, "active": True}, {"_id": 0, "id": 1, "role": 1}, session=session
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
        if draft.product_kind == "OIL":
            role = location.get("role", "NORMAL")
            if draft.destination_location_id == location_id and role == "QUARANTINE":
                if draft.movement_kind != "RECEIPT" or draft.source_document_type != "RET":
                    raise ValueError("Quarantine tanks accept stock only through the dedicated return workflow")
            if draft.source_location_id == location_id and role == "QUARANTINE":
                lot_quality = await db["commercial_lots"].find_one(
                    {"id": draft.lot_id}, {"_id": 0, "quality_status": 1}, session=session
                )
                quality_released_transfer = (
                    draft.movement_kind == "TRANSFER"
                    and lot_quality
                    and lot_quality.get("quality_status") == "RELEASED"
                )
                rejected_return_dispatch = (
                    draft.movement_kind == "DISPATCH"
                    and draft.source_document_type == "RJT"
                )
                if not quality_released_transfer and not rejected_return_dispatch:
                    raise ValueError("Quarantined oil can leave only by quality-released transfer or approved return rejection")
            # Serialize stock postings against tank-role changes. Both operations
            # write this same tank document in their transaction, so MongoDB
            # detects a concurrent role-change/stock-posting write conflict.
            guard = await db["commercial_tanks"].update_one(
                {"id": location_id, "active": True},
                {"$inc": {"stock_guard_version": 1}},
                session=session,
            )
            if guard.matched_count != 1:
                raise ValueError("Commercial tank changed during stock validation")

    for owner in (draft.source_owner, draft.destination_owner):
        if owner is None or owner.kind != "CUSTOMER":
            continue
        customer = await db["commercial_custody_owners"].find_one(
            {"id": owner.customer_id}, {"_id": 0, "id": 1}, session=session
        )
        if not customer:
            raise ValueError(f"Unknown commercial custody owner: {owner.customer_id}")

    collection_name = SOURCE_DOCUMENT_COLLECTIONS.get(draft.source_document_type)
    if not collection_name:
        raise ValueError(
            f"Unsupported source document type: {draft.source_document_type}"
        )
    source = await db[collection_name].find_one(
        {"id": draft.source_document_id},
        {"_id": 0, "id": 1, "status": 1, "returned_oil_lot_id": 1, "quarantine_tank_id": 1,
         "customer_id": 1, "olive_lot_id": 1, "receiving_location_id": 1,
         "oil_lot_id": 1, "source_tank_id": 1, "return_id": 1,
         "quantity_kg": 1},
        session=session,
    )
    if not source:
        raise ValueError("Source document does not exist")
    if draft.source_document_type == "RET":
        if (source.get("status") != "RECEIVED"
                or draft.movement_kind != "RECEIPT"
                or source.get("returned_oil_lot_id") != draft.lot_id
                or source.get("quarantine_tank_id") != draft.destination_location_id):
            raise ValueError("Return receipt does not match its received return document")
    elif draft.source_document_type == "CIN":
        if (source.get("status") != "RECEIVED"
                or draft.movement_kind != "RECEIPT"
                or draft.product_kind != "OLIVE"
                or source.get("olive_lot_id") != draft.lot_id
                or source.get("customer_id") != (draft.destination_owner.customer_id if draft.destination_owner else None)
                or source.get("receiving_location_id") != draft.destination_location_id):
            raise ValueError("Customer olive custody receipt does not match its source document")
    elif draft.source_document_type == "RJT":
        if (source.get("status") != "APPROVED"
                or draft.movement_kind != "DISPATCH"
                or draft.product_kind != "OIL"
                or source.get("oil_lot_id") != draft.lot_id
                or source.get("quarantine_tank_id") != draft.source_location_id
                or _quantity(source.get("quantity_kg")) != _quantity(draft.quantity_kg)):
            raise ValueError("Return rejection dispatch does not match its approved rejection document")
        returned = await db["commercial_sale_returns"].find_one(
            {"id": source.get("return_id"), "status": "RECEIVED",
             "commercial_acceptance_status": "PENDING",
             "returned_oil_lot_id": draft.lot_id,
             "quarantine_tank_id": draft.source_location_id},
            {"_id": 0, "id": 1}, session=session,
        )
        if not returned:
            raise ValueError("Return rejection does not match a pending received return")
    elif draft.source_document_type == "CUS":
        if (source.get("status") != "APPROVED"
                or draft.movement_kind != "DISPATCH"
                or draft.product_kind != "OIL"
                or source.get("oil_lot_id") != draft.lot_id
                or source.get("customer_id") != (draft.source_owner.customer_id if draft.source_owner else None)
                or source.get("source_tank_id") != draft.source_location_id):
            raise ValueError("Customer oil custody release does not match its source document")
        lot_quality = await db["commercial_lots"].find_one(
            {"id": draft.lot_id}, {"_id": 0, "quality_status": 1}, session=session
        )
        if not lot_quality or lot_quality.get("quality_status") != "RELEASED":
            raise ValueError("Customer oil pickup requires a released quality decision")
    elif source.get("status") not in {"APPROVED", "COMPLETED"}:
        raise ValueError("Source document is not approved for stock posting")
