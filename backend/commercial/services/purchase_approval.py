"""Approve an olive purchase and post its received olive lots atomically.

The caller must execute this function inside the existing MongoDB
run_transaction callback. No partial approval or stock receipt is permitted.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.schemas.purchases import ApproveOlivePurchaseCommand
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _idempotency_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def approve_olive_purchase(
    db: Any,
    purchase_id: str,
    command: ApproveOlivePurchaseCommand,
    *,
    actor_user: dict[str, Any],
    actor_user_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Approve a DRAFT purchase, create one lot per variety line, and receive stock."""
    require_commercial_permission(actor_user, "commercial.manage_purchases")
    if not actor_user_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor and timezone-aware timestamp are required")

    purchases = db["commercial_olive_purchases"]
    purchase = await purchases.find_one(
        {"id": purchase_id}, {"_id": 0}, session=session
    )
    if not purchase:
        raise ValueError("Olive purchase does not exist")

    expected_key = command.idempotency_key
    if purchase.get("status") == "APPROVED":
        if purchase.get("approval_idempotency_key") != expected_key:
            raise ValueError("Purchase was already approved with a different request")
        return purchase

    if purchase.get("status") != "DRAFT":
        raise ValueError("Only a draft olive purchase can be approved")
    if purchase.get("version") != command.expected_version:
        raise ValueError("Olive purchase version conflict")

    # Change source status first inside the transaction so movement validation
    # can verify APPROVED. A later failure aborts this status change as well.
    update = await purchases.update_one(
        {
            "id": purchase_id,
            "status": "DRAFT",
            "version": command.expected_version,
        },
        {
            "$set": {
                "status": "APPROVED",
                "approved_by": actor_user_id,
                "approved_at": created_at.astimezone(timezone.utc),
                "approval_idempotency_key": expected_key,
                "receiving_location_id": command.receiving_location_id,
                "updated_at": created_at.astimezone(timezone.utc),
            },
            "$inc": {"version": 1},
        },
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Olive purchase changed concurrently; reload and retry")

    lot_ids: list[str] = []
    movement_ids: list[str] = []
    for index, line in enumerate(purchase["lines"]):
        line_key = f"{purchase_id}:{expected_key}:{index}"
        lot_id = _stable_id("lot", line_key)
        movement_id = _stable_id("movement", line_key)
        audit_event_id = _stable_id("movement-audit", line_key)
        lot_number = await reserve_document_number(
            db["commercial_counters"], purchase["season_code"], "LOT",
            session=session,
        )
        lot = {
            "id": lot_id,
            "season_code": purchase["season_code"],
            "document_type": "LOT",
            "document_number": lot_number,
            "product_kind": "OLIVE",
            "variety_id": line["variety_id"],
            "source_purchase_id": purchase_id,
            "supplier_id": purchase["supplier_id"],
            "quantity_received_kg": line["quantity_kg"],
            "owner": {"kind": "MILL"},
            "quality_status": "PENDING",
            "status": "OPEN",
            "created_by": actor_user_id,
            "created_at": created_at.astimezone(timezone.utc),
        }
        await db["commercial_lots"].insert_one(lot, session=session)

        movement = StockMovementDraft(
            movement_kind="RECEIPT",
            product_kind="OLIVE",
            lot_id=lot_id,
            quantity_kg=line["quantity_kg"].to_decimal(),
            destination_location_id=command.receiving_location_id,
            destination_owner=OwnerRef(kind="MILL"),
            source_document_type="ACH",
            source_document_id=purchase_id,
            idempotency_key=_idempotency_key(line_key),
            reason=f"Reception from approved purchase {purchase['document_number']}",
        )
        await post_stock_movement(
            db,
            movement,
            season_code=purchase["season_code"],
            actor_user_id=actor_user_id,
            actor_user=actor_user,
            movement_id=movement_id,
            audit_event_id=audit_event_id,
            created_at=created_at,
            session=session,
        )
        lot_ids.append(lot_id)
        movement_ids.append(movement_id)

    final_update = await purchases.update_one(
        {"id": purchase_id, "status": "APPROVED", "version": command.expected_version + 1},
        {
            "$set": {
                "lot_ids": lot_ids,
                "receipt_movement_ids": movement_ids,
                "updated_at": created_at.astimezone(timezone.utc),
            }
        },
        session=session,
    )
    if final_update.matched_count != 1:
        raise ValueError("Approved purchase changed before its receipt links were saved")
    await db["commercial_audit_events"].insert_one(
        {
            "id": _stable_id("purchase-approval-audit", f"{purchase_id}:{expected_key}"),
            "entity_type": "olive_purchase",
            "entity_id": purchase_id,
            "action": "APPROVED_AND_RECEIVED",
            "actor_user_id": actor_user_id,
            "created_at": created_at.astimezone(timezone.utc),
            "details": {
                "lot_ids": lot_ids,
                "movement_ids": movement_ids,
                "receiving_location_id": command.receiving_location_id,
            },
        },
        session=session,
    )
    result = await purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
    return result
