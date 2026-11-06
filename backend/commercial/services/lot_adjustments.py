"""Audited stock corrections for olive lots that are ready for production."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import OliveLotBalanceAdjustmentDraft, OwnerRef, StockMovementDraft
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value or "0"))


def _owner_document(owner: OwnerRef | None) -> dict[str, str] | None:
    return owner.model_dump(exclude_none=True) if owner else None


async def adjust_olive_lot_balance(
    db: Any,
    lot_id: str,
    draft: OliveLotBalanceAdjustmentDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    adjustment_document_id: str,
    stock_movement_id: str,
    audit_event_id: str,
    adjusted_at: datetime,
    session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_lots")
    require_commercial_permission(actor_user, "commercial.post_stock")
    if not actor_user_id or adjusted_at.tzinfo is None:
        raise ValueError("Authenticated actor and timezone-aware timestamp are required")

    lot = await db["commercial_lots"].find_one(
        {"id": lot_id, "product_kind": "OLIVE", "status": "OPEN"},
        {"_id": 0}, session=session,
    )
    if not lot:
        raise ValueError("Open olive lot does not exist")
    if int(lot.get("version", 1)) != draft.expected_version:
        raise ValueError("Olive lot version conflict")
    season_code = lot.get("season_code") or season_code
    if (
        lot.get("preproduction_quality_status") != "RELEASED"
        or not lot.get("preproduction_sample_id")
        or not lot.get("preproduction_quality_assessment_id")
        or lot.get("latest_preproduction_sample_id") != lot.get("preproduction_sample_id")
    ):
        raise ValueError("Only the latest quality-released olive lot can be adjusted from production")

    location = await db["commercial_locations"].find_one(
        {"id": draft.location_id, "active": True, "kind": {"$in": ["OLIVE_STORAGE", "STAGING"]}},
        {"_id": 0, "id": 1}, session=session,
    )
    if not location:
        raise ValueError("Unknown or inactive olive storage location")
    owner = OwnerRef.model_validate(lot.get("owner") or {"kind": "MILL"})
    balance = await db["commercial_stock_balances"].find_one(
        {"product_kind": "OLIVE", "lot_id": lot_id,
         "owner.kind": owner.kind, "owner.customer_id": owner.customer_id,
         "location_id": draft.location_id},
        {"_id": 0, "quantity_kg": 1}, session=session,
    )
    current_quantity = _decimal(balance.get("quantity_kg")) if balance else Decimal("0")
    delta = draft.target_quantity_kg - current_quantity
    if delta == 0:
        raise ValueError("The target quantity already matches the current balance")
    reason = draft.reason.strip()
    if len(reason) < 5:
        raise ValueError("An adjustment reason of at least five characters is required")

    key = hashlib.sha256(f"olive-lot-balance:{adjustment_document_id}".encode("utf-8")).hexdigest()
    scope = f"{season_code}:{actor_user_id}"
    now = adjusted_at.astimezone(timezone.utc)
    if delta > 0:
        movement_kind = "RECEIPT"
        source_location_id = None
        destination_location_id = draft.location_id
        source_owner = None
        destination_owner = owner
        quantity = delta
    else:
        movement_kind = "DISPATCH"
        source_location_id = draft.location_id
        destination_location_id = None
        source_owner = owner
        destination_owner = None
        quantity = -delta

    number = await reserve_document_number(db["commercial_counters"], season_code, "INT", session=session)
    ledger_draft = StockMovementDraft(
        movement_kind=movement_kind,
        product_kind="OLIVE",
        lot_id=lot_id,
        quantity_kg=quantity,
        source_location_id=source_location_id,
        destination_location_id=destination_location_id,
        source_owner=source_owner,
        destination_owner=destination_owner,
        source_document_type="INT",
        source_document_id=adjustment_document_id,
        idempotency_key=key,
        reason=f"Ready-lot balance correction: {reason}"[:500],
    )
    document = {
        "id": adjustment_document_id,
        "season_code": season_code,
        "document_type": "INT",
        "document_number": number,
        "movement_kind": movement_kind,
        "product_kind": "OLIVE",
        "lot_id": lot_id,
        "quantity_kg": Decimal128(quantity),
        "source_location_id": source_location_id,
        "destination_location_id": destination_location_id,
        "source_owner": _owner_document(source_owner),
        "destination_owner": _owner_document(destination_owner),
        "status": "APPROVED",
        "correction_of_type": "OLIVE_LOT_BALANCE",
        "correction_of_id": lot_id,
        "reason": reason,
        "idempotency_scope": scope,
        "idempotency_key": key,
        "request_fingerprint": hashlib.sha256(
            json.dumps(ledger_draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "created_by": actor_user_id,
        "created_at": now,
    }
    await db["commercial_internal_movements"].insert_one(document, session=session)
    ledger = await post_stock_movement(
        db, ledger_draft, season_code=season_code, actor_user_id=actor_user_id,
        actor_user=actor_user, movement_id=stock_movement_id,
        audit_event_id=f"{audit_event_id}:movement", created_at=adjusted_at,
        session=session,
    )
    await db["commercial_internal_movements"].update_one(
        {"id": adjustment_document_id, "status": "APPROVED"},
        {"$set": {"stock_movement_id": ledger["id"]}}, session=session,
    )

    balance_rows = await db["commercial_stock_balances"].find(
        {"product_kind": "OLIVE", "lot_id": lot_id},
        {"_id": 0, "quantity_kg": 1}, session=session,
    ).to_list(None)
    lot_is_empty = all(_decimal(row.get("quantity_kg")) == 0 for row in balance_rows)
    version_filter = (
        {"version": draft.expected_version} if draft.expected_version > 1 else
        {"$or": [{"version": 1}, {"version": {"$exists": False}}]}
    )
    changes: dict[str, Any] = {
        "version": draft.expected_version + 1,
        "updated_at": now,
        "updated_by": actor_user_id,
    }
    if lot_is_empty:
        changes.update({"status": "CLOSED", "closed_at": now})
    updated = await db["commercial_lots"].update_one(
        {"id": lot_id, "status": "OPEN", **version_filter},
        {"$set": changes},
        session=session,
    )
    if updated.matched_count != 1:
        raise ValueError("Olive lot changed concurrently; reload and retry")

    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id,
        "entity_type": "commercial_lot",
        "entity_id": lot_id,
        "action": "OLIVE_LOT_BALANCE_ADJUSTED",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "document_number": number,
            "location_id": draft.location_id,
            "previous_quantity_kg": Decimal128(current_quantity),
            "target_quantity_kg": Decimal128(draft.target_quantity_kg),
            "reason": reason,
            "stock_movement_id": ledger["id"],
            "closed_when_empty": lot_is_empty,
        },
    }, session=session)
    return {
        "lot_id": lot_id,
        "movement_id": ledger["id"],
        "document_number": number,
        "previous_quantity_kg": str(current_quantity),
        "target_quantity_kg": str(draft.target_quantity_kg),
        "lot_status": "CLOSED" if lot_is_empty else "OPEN",
    }
