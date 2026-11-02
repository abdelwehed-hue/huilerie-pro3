"""Transactional append-only stock ledger for the commercial module.

Call post_stock_movement only from the callback passed to the existing
run_transaction helper. IDs and created_at must be generated before entering
that callback so MongoDB transaction retries reuse the same values.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128

from commercial.schemas.inventory import StockMovementDraft
from commercial.services.numbering import reserve_document_number


def _decimal128(value: Decimal) -> Decimal128:
    # Pydantic has already constrained precision/scale; never route stock via float.
    return Decimal128(value)


def _owner_document(owner: Any) -> dict[str, str]:
    data = {"kind": owner.kind}
    if owner.customer_id is not None:
        data["customer_id"] = owner.customer_id
    return data


def _balance_identity(
    product_kind: str, lot_id: str, owner: Any, location_id: str
) -> dict[str, Any]:
    return {
        "product_kind": product_kind,
        "lot_id": lot_id,
        "owner.kind": owner.kind,
        "owner.customer_id": owner.customer_id,
        "location_id": location_id,
    }


def _fingerprint(draft: StockMovementDraft) -> str:
    canonical = draft.model_dump(mode="json")
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _decrement_balance(
    collection: Any, identity: dict[str, Any], quantity: Decimal128, session: Any
) -> None:
    result = await collection.update_one(
        {**identity, "quantity_kg": {"$gte": quantity}},
        {"$inc": {"quantity_kg": Decimal128(-quantity.to_decimal())}},
        session=session,
    )
    if result.matched_count != 1:
        raise ValueError("Insufficient stock for this movement")


async def _increment_balance(
    collection: Any,
    identity: dict[str, Any],
    quantity: Decimal128,
    created_at: datetime,
    session: Any,
) -> None:
    # Unique balance identity index protects concurrent first-time creation.
    await collection.update_one(
        identity,
        {
            "$inc": {"quantity_kg": quantity},
            "$setOnInsert": {"created_at": created_at.astimezone(timezone.utc)},
        },
        upsert=True,
        session=session,
    )


async def post_stock_movement(
    db: Any,
    draft: StockMovementDraft,
    *,
    season_code: str,
    actor_user_id: str,
    movement_id: str,
    audit_event_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Post one movement inside an already active MongoDB transaction.

    The caller must authorize the actor, verify referenced lot/tank/source
    document state, and generate stable IDs/time before transaction execution.
    This service enforces idempotency, stock arithmetic, numbering, ledger and
    audit writes. It intentionally does not transition source documents.
    """
    if not actor_user_id or not movement_id or not audit_event_id:
        raise ValueError("Actor and stable event identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    movements = db["commercial_stock_movements"]
    balances = db["commercial_stock_balances"]
    audit = db["commercial_audit_events"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)

    prior = await movements.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for a different request")
        return prior

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "MVT", session=session
    )
    quantity = _decimal128(draft.quantity_kg)

    if draft.source_location_id is not None:
        source_identity = _balance_identity(
            draft.product_kind, draft.lot_id, draft.source_owner,
            draft.source_location_id,
        )
        await _decrement_balance(balances, source_identity, quantity, session)

    if draft.destination_location_id is not None:
        destination_identity = _balance_identity(
            draft.product_kind, draft.lot_id, draft.destination_owner,
            draft.destination_location_id,
        )
        await _increment_balance(balances, destination_identity, quantity, created_at, session)

    record = {
        "id": movement_id,
        "season_code": season_code,
        "document_type": "MVT",
        "document_number": number,
        "movement_kind": draft.movement_kind,
        "product_kind": draft.product_kind,
        "lot_id": draft.lot_id,
        "quantity_kg": quantity,
        "source_location_id": draft.source_location_id,
        "destination_location_id": draft.destination_location_id,
        "source_owner": _owner_document(draft.source_owner) if draft.source_owner else None,
        "destination_owner": _owner_document(draft.destination_owner) if draft.destination_owner else None,
        "source_document_type": draft.source_document_type,
        "source_document_id": draft.source_document_id,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "reason": draft.reason,
        "created_by": actor_user_id,
        "created_at": created_at.astimezone(timezone.utc),
    }
    await movements.insert_one(record, session=session)
    await audit.insert_one(
        {
            "id": audit_event_id,
            "entity_type": "stock_movement",
            "entity_id": movement_id,
            "action": "POSTED",
            "actor_user_id": actor_user_id,
            "created_at": created_at.astimezone(timezone.utc),
            "details": {
                "document_number": number,
                "movement_kind": draft.movement_kind,
                "lot_id": draft.lot_id,
                "quantity_kg": quantity,
            },
        },
        session=session,
    )
    return record
