"""Create an approved internal movement document and post its ledger entry atomically."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
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
        return prior

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
            "unit_price_tnd_per_l": Decimal128(draft.consideration_unit_price_tnd_per_l) if draft.consideration_unit_price_tnd_per_l is not None else None,
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
