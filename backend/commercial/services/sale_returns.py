"""Atomic physical intake of approved wholesale sale returns into quarantine."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.schemas.returns import SaleReturnDraft
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(value)


def _fingerprint(draft: SaleReturnDraft) -> str:
    raw = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def receive_wholesale_sale_return(
    db: Any, sale_id: str, draft: SaleReturnDraft, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    return_id: str, returned_lot_id: str, stock_movement_id: str,
    audit_event_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    """Receive returned mill-owned oil into a quarantine tank; never credit sale stock."""
    require_commercial_permission(actor_user, "commercial.manage_sales")
    require_commercial_permission(actor_user, "commercial.post_stock")
    if not actor_user_id or not all((sale_id, return_id, returned_lot_id, stock_movement_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable return identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    returns = db["commercial_sale_returns"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await returns.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint or prior.get("sale_id") != sale_id:
            raise ValueError("Return idempotency key was used for a different request")
        return prior

    sale = await db["commercial_sales"].find_one(
        {"id": sale_id}, {"_id": 0}, session=session
    )
    if not sale:
        raise ValueError("Wholesale sale does not exist")
    if sale.get("status") != "APPROVED":
        raise ValueError("Only an approved wholesale sale can receive a return")
    if int(sale.get("version", 0)) != draft.expected_sale_version:
        raise ValueError("Wholesale sale version conflict")

    invoice = await db["commercial_sales_invoices"].find_one(
        {"id": sale.get("invoice_id"), "sale_id": sale_id},
        {"_id": 0, "id": 1, "sale_id": 1}, session=session,
    )
    if not invoice:
        raise ValueError("Approved sale has no matching commercial invoice")

    original_lot = await db["commercial_lots"].find_one(
        {"id": sale.get("oil_lot_id"), "product_kind": "OIL", "owner.kind": "MILL"},
        {"_id": 0, "id": 1, "product_kind": 1, "owner": 1}, session=session,
    )
    if not original_lot:
        raise ValueError("Original sale oil lot is missing or not mill-owned")

    quarantine = await db["commercial_tanks"].find_one(
        {"id": draft.quarantine_tank_id, "active": True, "role": "QUARANTINE"},
        {"_id": 0, "id": 1, "role": 1}, session=session,
    )
    if not quarantine:
        raise ValueError("Return intake requires an active designated quarantine tank")

    sold_quantity = _decimal(sale["quantity_kg"])
    already_returned = _decimal(sale.get("returned_quantity_kg", Decimal128("0.000")))
    remaining = sold_quantity - already_returned
    if draft.quantity_kg > remaining:
        raise ValueError("Return quantity exceeds the remaining dispatched quantity")

    return_number = await reserve_document_number(
        db["commercial_counters"], season_code, "RET", session=session
    )
    lot_number = await reserve_document_number(
        db["commercial_counters"], season_code, "LOT", session=session
    )
    now = created_at.astimezone(timezone.utc)
    returned_lot = {
        "id": returned_lot_id, "season_code": season_code,
        "document_type": "LOT", "document_number": lot_number,
        "product_kind": "OIL", "source_sale_return_id": return_id,
        "source_sale_id": sale_id, "source_original_lot_id": sale["oil_lot_id"],
        "quantity_received_kg": Decimal128(draft.quantity_kg),
        "owner": {"kind": "MILL"}, "quality_status": "PENDING",
        "status": "OPEN", "version": 1,
        "created_by": actor_user_id, "created_at": now,
    }
    return_doc = {
        "id": return_id, "season_code": season_code,
        "document_type": "RET", "document_number": return_number,
        "sale_id": sale_id, "invoice_id": invoice["id"],
        "buyer_id": sale["buyer_id"], "original_oil_lot_id": sale["oil_lot_id"],
        "returned_oil_lot_id": returned_lot_id,
        "quarantine_tank_id": draft.quarantine_tank_id,
        "quantity_kg": Decimal128(draft.quantity_kg),
        "reason": draft.reason,
        "buyer_acknowledgement_reference": draft.buyer_acknowledgement_reference,
        "status": "RECEIVED", "commercial_acceptance_status": "PENDING",
        "quality_status": "PENDING",
        "idempotency_scope": scope, "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id, "received_at": now, "created_at": now,
    }

    sale_update = await db["commercial_sales"].update_one(
        {"id": sale_id, "status": "APPROVED", "version": draft.expected_sale_version},
        {"$set": {
            "returned_quantity_kg": Decimal128(already_returned + draft.quantity_kg),
            "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if sale_update.matched_count != 1:
        raise ValueError("Wholesale sale changed concurrently; return intake must be retried")

    await returns.insert_one(return_doc, session=session)
    await db["commercial_lots"].insert_one(returned_lot, session=session)

    ledger = await post_stock_movement(
        db,
        StockMovementDraft(
            movement_kind="RECEIPT", product_kind="OIL",
            lot_id=returned_lot_id, quantity_kg=draft.quantity_kg,
            destination_location_id=draft.quarantine_tank_id,
            destination_owner=OwnerRef(kind="MILL"),
            source_document_type="RET", source_document_id=return_id,
            idempotency_key=hashlib.sha256(
                f"return-receipt:{return_id}:{draft.idempotency_key}".encode()
            ).hexdigest(),
            reason=f"Returned oil received under {return_number}; quarantine pending reinspection",
        ),
        season_code=season_code, actor_user_id=actor_user_id,
        actor_user=actor_user, movement_id=stock_movement_id,
        audit_event_id=f"{audit_event_id}:stock", created_at=created_at,
        session=session,
    )
    return_doc["stock_movement_id"] = ledger["id"]
    await returns.update_one(
        {"id": return_id, "status": "RECEIVED"},
        {"$set": {"stock_movement_id": ledger["id"]}}, session=session,
    )
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_sale_return",
        "entity_id": return_id, "action": "SALE_RETURN_RECEIVED_IN_QUARANTINE",
        "actor_user_id": actor_user_id, "created_at": now,
        "details": {
            "return_number": return_number, "sale_id": sale_id,
            "invoice_id": invoice["id"], "quantity_kg": Decimal128(draft.quantity_kg),
            "returned_lot_id": returned_lot_id,
            "quarantine_tank_id": draft.quarantine_tank_id,
        },
    }, session=session)
    return return_doc
