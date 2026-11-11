"""Create an approved internal movement document and post its ledger entry atomically."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128

from commercial.schemas.internal_movements import InternalMovementDraft
from commercial.schemas.inventory import StockMovementDraft
from commercial.services.stock_ledger import post_stock_movement
from commercial.services.numbering import reserve_document_number
from commercial.services.oil_purchases import create_oil_purchase_document_for_transfer
from commercial.permissions import require_commercial_permission


def _fingerprint(draft: InternalMovementDraft) -> str:
    raw = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _lock_transferred_source_load(db: Any, draft: InternalMovementDraft, *, session: Any, actor_user_id: str, created_at: datetime) -> None:
    """Lock a legacy load only after all its customer-owned olive stock is transferred."""
    if draft.product_kind != "OLIVE" or draft.movement_kind != "OWNERSHIP_TRANSFER":
        return
    lot = await db["commercial_lots"].find_one(
        {"id": draft.lot_id, "product_kind": "OLIVE"},
        {"_id": 0, "source_load_id": 1, "source_load_code": 1},
        session=session,
    )
    source_load_id = (lot or {}).get("source_load_id")
    source_load_code = (lot or {}).get("source_load_code")
    if not source_load_id and not source_load_code:
        return
    source_load_filter = {"id": source_load_id} if source_load_id else {"code": source_load_code}
    source_load = await db["loads"].find_one(
        source_load_filter,
        {"_id": 0, "id": 1, "code": 1, "olive_kg": 1, "custody_received_kg": 1},
        session=session,
    )
    if not source_load:
        return
    source_load_id = source_load["id"]
    if not source_load:
        return
    # A source load may have been received into custody in multiple batches.
    # Do not close it until its entire original weight has been received and
    # every linked lot has zero remaining customer-owned stock.
    received_raw = source_load.get("custody_received_kg", 0)
    received = received_raw.to_decimal() if hasattr(received_raw, "to_decimal") else Decimal(str(received_raw))
    if received < Decimal(str(source_load.get("olive_kg", 0))):
        return
    source_link_filters = [{"source_load_id": source_load_id}]
    if source_load.get("code"):
        source_link_filters.append({"source_load_code": source_load["code"]})
    linked_lots = await db["commercial_lots"].find(
        {"product_kind": "OLIVE", "$or": source_link_filters},
        {"_id": 0, "id": 1},
        session=session,
    ).to_list(500)
    lot_ids = [item["id"] for item in linked_lots]
    if not lot_ids:
        return
    remaining = await db["commercial_stock_balances"].find(
        {"product_kind": "OLIVE", "lot_id": {"$in": lot_ids}, "owner.kind": "CUSTOMER"},
        {"_id": 0, "quantity_kg": 1},
        session=session,
    ).to_list(1000)
    remaining_total = Decimal("0")
    for balance in remaining:
        raw = balance.get("quantity_kg", 0)
        remaining_total += raw.to_decimal() if hasattr(raw, "to_decimal") else Decimal(str(raw))
    if remaining_total > 0:
        return
    load = await db["loads"].find_one_and_update(
        {"id": source_load_id, "ownership_transferred": {"$ne": True}},
        {"$set": {
            "customer_available_olive_kg": 0,
            "ownership_transferred": True,
            "ownership_transferred_at": created_at.astimezone(timezone.utc),
            "ownership_transfer_lot_id": draft.lot_id,
        }},
        projection={"_id": 0, "id": 1, "code": 1},
        return_document=True,
        session=session,
    )
    if load:
        await db["commercial_audit_events"].insert_one({
            "id": f"load-ownership-transfer:{source_load_id}",
            "entity_type": "traditional_load",
            "entity_id": source_load_id,
            "action": "LOAD_OWNERSHIP_TRANSFERRED_TO_MILL",
            "actor_user_id": actor_user_id,
            "created_at": created_at.astimezone(timezone.utc),
            "details": {"load_code": load.get("code"), "lot_ids": lot_ids,
                        "available_olive_kg_after": 0},
        }, session=session)


async def create_internal_movement(
    db: Any, draft: InternalMovementDraft, *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, movement_document_id: str,
    stock_movement_id: str, audit_event_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.post_stock")
    if not actor_user_id or not movement_document_id or not stock_movement_id or not audit_event_id:
        raise ValueError("Stable actor and document identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    collection = db["commercial_internal_movements"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await collection.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for a different internal movement")
        await _lock_transferred_source_load(db, draft, session=session, actor_user_id=actor_user_id, created_at=created_at)
        return prior

    # Ownership transfers consume the entire selected customer balance.
    # This transactional check prevents partial transfers and concurrent races.
    if draft.movement_kind == "OWNERSHIP_TRANSFER":
        if draft.source_owner.kind != "CUSTOMER" or draft.destination_owner.kind != "MILL":
            raise ValueError("Ownership transfer must move stock from a customer to the mill")
        source_balance = await db["commercial_stock_balances"].find_one({
            "product_kind": draft.product_kind, "lot_id": draft.lot_id,
            "location_id": draft.source_location_id, "owner.kind": "CUSTOMER",
            "owner.customer_id": draft.source_owner.customer_id,
        }, {"_id": 0, "quantity_kg": 1}, session=session)
        if not source_balance:
            raise ValueError("Customer stock is no longer available for ownership transfer")
        raw_available = source_balance.get("quantity_kg", 0)
        available = raw_available.to_decimal() if hasattr(raw_available, "to_decimal") else Decimal(str(raw_available))
        if draft.quantity_kg != available:
            raise ValueError("Partial ownership transfers are not allowed; transfer the full available quantity")

    now = created_at.astimezone(timezone.utc)
    document_number = await reserve_document_number(
        db["commercial_counters"], season_code, "INT", session=session
    )
    document = {
        "id": movement_document_id,
        "season_code": season_code,
        "document_type": "INT",
        "document_number": document_number,
        "movement_kind": draft.movement_kind,
        "product_kind": draft.product_kind,
        "lot_id": draft.lot_id,
        "quantity_kg": Decimal128(draft.quantity_kg),
        "source_location_id": draft.source_location_id,
        "destination_location_id": draft.destination_location_id,
        "source_owner": draft.source_owner.model_dump(),
        "destination_owner": draft.destination_owner.model_dump(),
        "consent_evidence": ({
            "method": draft.consent_method,
            "document_reference": draft.consent_reference,
            "customer_name": draft.consent_customer_name,
            "customer_confirmed_in_app": draft.consent_confirmed,
            "recorded_by": actor_user_id,
            "recorded_at": now,
        } if draft.movement_kind == "OWNERSHIP_TRANSFER" else None),
        "consideration": ({
            "type": draft.consideration_type,
            "agreed_amount": Decimal128(draft.consideration_amount) if draft.consideration_amount is not None else None,
            "currency": "TND",
            "accounting_status": "PENDING_ACCOUNTING_INTEGRATION" if draft.consideration_type == "SALE" else "NO_CONSIDERATION",
            "payment_status": "NOT_RECORDED" if draft.consideration_type == "SALE" else "NOT_APPLICABLE",
        } if draft.movement_kind == "OWNERSHIP_TRANSFER" else None),
        "status": "APPROVED",
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }
    await collection.insert_one(document, session=session)

    ledger_draft = StockMovementDraft(
        movement_kind=draft.movement_kind,
        product_kind=draft.product_kind,
        lot_id=draft.lot_id,
        quantity_kg=draft.quantity_kg,
        source_location_id=draft.source_location_id,
        destination_location_id=draft.destination_location_id,
        source_owner=draft.source_owner,
        destination_owner=draft.destination_owner,
        source_document_type="INT",
        source_document_id=movement_document_id,
        idempotency_key=draft.idempotency_key,
        reason=draft.reason,
    )
    ledger = await post_stock_movement(
        db, ledger_draft, season_code=season_code, actor_user_id=actor_user_id,
        actor_user=actor_user, movement_id=stock_movement_id,
        audit_event_id=audit_event_id, created_at=created_at, session=session,
    )
    await _lock_transferred_source_load(db, draft, session=session, actor_user_id=actor_user_id, created_at=created_at)
    document["stock_movement_id"] = ledger["id"]
    await collection.update_one(
        {"id": movement_document_id, "status": "APPROVED"},
        {"$set": {"stock_movement_id": ledger["id"]}}, session=session,
    )
    if draft.movement_kind == "OWNERSHIP_TRANSFER" and draft.consideration_type == "SALE":
        await create_oil_purchase_document_for_transfer(
            db, document, draft, season_code=season_code,
            actor_user_id=actor_user_id, created_at=created_at, session=session,
        )
    return document
