"""Audited rejection and physical re-dispatch of an unaccepted sale return."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.schemas.return_rejection import RejectSaleReturnCommand
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value or "0"))


def _fingerprint(command: RejectSaleReturnCommand) -> str:
    raw = json.dumps(command.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def reject_sale_return_and_dispatch_to_buyer(
    db: Any, return_id: str, command: RejectSaleReturnCommand, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    rejection_id: str, movement_id: str, audit_event_id: str,
    decided_at: datetime, session: Any,
) -> dict[str, Any]:
    """Reject a received return and dispatch its quarantined lot back to the buyer.

    No credit note, invoice adjustment, or cash refund is created. The rejected
    quantity is removed from the sale's active return accumulator so a later
    valid return attempt is not incorrectly blocked.
    """
    require_commercial_permission(actor_user, "commercial.manage_sales")
    require_commercial_permission(actor_user, "commercial.post_stock")
    if not actor_user_id or not all((return_id, rejection_id, movement_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable rejection identifiers are required")
    if decided_at.tzinfo is None:
        raise ValueError("decided_at must be timezone-aware")

    rejections = db["commercial_sale_return_rejections"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(command)
    prior = await rejections.find_one(
        {"idempotency_scope": scope, "idempotency_key": command.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint or prior.get("return_id") != return_id:
            raise ValueError("Return rejection idempotency key was used for a different request")
        return prior

    returns = db["commercial_sale_returns"]
    returned = await returns.find_one({"id": return_id}, {"_id": 0}, session=session)
    if not returned:
        raise ValueError("Sale return does not exist")
    if returned.get("status") != "RECEIVED" or returned.get("commercial_acceptance_status") != "PENDING":
        raise ValueError("Only a received, commercially undecided return can be rejected")
    if int(returned.get("version", 1)) != command.expected_return_version:
        raise ValueError("Sale return version conflict; reload before rejecting")

    sale = await db["commercial_sales"].find_one(
        {"id": returned["sale_id"], "status": "APPROVED"},
        {"_id": 0, "id": 1, "buyer_id": 1, "version": 1, "returned_quantity_kg": 1},
        session=session,
    )
    if not sale or sale.get("buyer_id") != returned.get("buyer_id"):
        raise ValueError("Return does not match an approved sale and its buyer")

    quantity = _decimal(returned["quantity_kg"])
    returned_total = _decimal(sale.get("returned_quantity_kg", Decimal128("0.000")))
    if quantity <= 0 or returned_total < quantity:
        raise ValueError("Sale return accumulator is inconsistent; reconcile before rejection")

    lot_id = returned["returned_oil_lot_id"]
    lot = await db["commercial_lots"].find_one(
        {"id": lot_id, "product_kind": "OIL", "source_sale_return_id": return_id,
         "status": "OPEN", "owner.kind": "MILL"},
        {"_id": 0, "id": 1, "quality_status": 1, "version": 1},
        session=session,
    )
    if not lot:
        raise ValueError("Returned oil lot is missing, closed, or not mill-owned")

    tank_id = returned["quarantine_tank_id"]
    tank = await db["commercial_tanks"].find_one(
        {"id": tank_id, "active": True, "role": "QUARANTINE"},
        {"_id": 0, "id": 1}, session=session,
    )
    if not tank:
        raise ValueError("Rejected return must still be held in its designated quarantine tank")

    now = decided_at.astimezone(timezone.utc)
    number = await reserve_document_number(
        db["commercial_counters"], season_code, "RJT", session=session
    )
    rejection = {
        "id": rejection_id,
        "season_code": season_code,
        "document_type": "RJT",
        "document_number": number,
        "return_id": return_id,
        "sale_id": sale["id"],
        "buyer_id": sale["buyer_id"],
        "oil_lot_id": lot_id,
        "quarantine_tank_id": tank_id,
        "quantity_kg": Decimal128(quantity),
        "rejection_date": command.rejection_date.isoformat(),
        "reason": command.reason,
        "buyer_receipt_reference": command.buyer_receipt_reference,
        "status": "APPROVED",
        "idempotency_scope": scope,
        "idempotency_key": command.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }
    await rejections.insert_one(rejection, session=session)

    movement = await post_stock_movement(
        db,
        StockMovementDraft(
            movement_kind="DISPATCH",
            product_kind="OIL",
            lot_id=lot_id,
            quantity_kg=quantity,
            source_location_id=tank_id,
            source_owner=OwnerRef(kind="MILL"),
            source_document_type="RJT",
            source_document_id=rejection_id,
            idempotency_key=hashlib.sha256(
                f"return-rejection-dispatch:{rejection_id}:{command.idempotency_key}".encode()
            ).hexdigest(),
            reason=f"Rejected return dispatched back to buyer under {number}",
        ),
        season_code=season_code,
        actor_user_id=actor_user_id,
        actor_user=actor_user,
        movement_id=movement_id,
        audit_event_id=f"{audit_event_id}:stock",
        created_at=decided_at,
        session=session,
    )

    sale_update = await db["commercial_sales"].update_one(
        {"id": sale["id"], "version": sale.get("version", 1),
         "returned_quantity_kg": sale.get("returned_quantity_kg", Decimal128("0.000"))},
        {"$set": {
            "returned_quantity_kg": Decimal128(returned_total - quantity),
            "updated_at": now,
            "updated_by": actor_user_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if sale_update.matched_count != 1:
        raise ValueError("Sale changed concurrently; return rejection was rolled back")

    lot_update = await db["commercial_lots"].update_one(
        {"id": lot_id, "version": lot.get("version", 1), "status": "OPEN"},
        {"$set": {
            "status": "CLOSED",
            "closed_reason": "RETURN_REJECTED_AND_DISPATCHED_TO_BUYER",
            "closed_at": now,
            "closed_by": actor_user_id,
            "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if lot_update.matched_count != 1:
        raise ValueError("Returned oil lot changed concurrently; rejection was rolled back")

    return_update = await returns.update_one(
        {"id": return_id, "version": command.expected_return_version,
         "status": "RECEIVED", "commercial_acceptance_status": "PENDING"},
        {"$set": {
            "status": "REJECTED",
            "commercial_acceptance_status": "REJECTED",
            "rejection_id": rejection_id,
            "rejected_at": now,
            "rejected_by": actor_user_id,
            "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if return_update.matched_count != 1:
        raise ValueError("Sale return changed concurrently; rejection was rolled back")

    rejection["stock_movement_id"] = movement["id"]
    await rejections.update_one(
        {"id": rejection_id, "status": "APPROVED"},
        {"$set": {"stock_movement_id": movement["id"]}},
        session=session,
    )
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id,
        "entity_type": "commercial_sale_return_rejection",
        "entity_id": rejection_id,
        "action": "SALE_RETURN_REJECTED_AND_DISPATCHED",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "rejection_number": number,
            "return_id": return_id,
            "return_number": returned.get("document_number"),
            "sale_id": sale["id"],
            "buyer_id": sale["buyer_id"],
            "oil_lot_id": lot_id,
            "quantity_kg": Decimal128(quantity),
            "reason": command.reason,
            "rejection_date": command.rejection_date.isoformat(),
            "quarantine_tank_id": tank_id,
            "previous_return_status": returned.get("status"),
            "new_return_status": "REJECTED",
            "previous_acceptance_status": returned.get("commercial_acceptance_status"),
            "new_acceptance_status": "REJECTED",
            "previous_return_version": command.expected_return_version,
            "new_return_version": command.expected_return_version + 1,
            "previous_sale_returned_quantity_kg": Decimal128(returned_total),
            "new_sale_returned_quantity_kg": Decimal128(returned_total - quantity),
            "previous_sale_version": sale.get("version", 1),
            "new_sale_version": sale.get("version", 1) + 1,
            "previous_lot_status": lot.get("status"),
            "new_lot_status": "CLOSED",
            "previous_lot_quality_status": lot.get("quality_status"),
            "new_lot_version": lot.get("version", 1) + 1,
            "stock_movement_id": movement["id"],
            "buyer_receipt_reference": command.buyer_receipt_reference,
        },
    }, session=session)
    return rejection
