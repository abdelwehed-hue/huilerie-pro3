"""Draft creation for commercial olive purchases.

This service creates a draft only. It does not create a lot or post stock;
approval and receipt posting are a separate transactional command.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.purchases import OlivePurchaseDraft
from commercial.services.numbering import reserve_document_number


def _fingerprint(draft: OlivePurchaseDraft) -> str:
    raw = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def create_olive_purchase_draft(
    db: Any,
    draft: OlivePurchaseDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    purchase_id: str,
    audit_event_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_purchases")
    if not actor_user_id or not purchase_id or not audit_event_id:
        raise ValueError("Stable actor and document identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    suppliers = db["commercial_suppliers"]
    supplier = await suppliers.find_one(
        {"id": draft.supplier_id, "active": True}, {"_id": 0, "id": 1},
        session=session,
    )
    if not supplier:
        raise ValueError("Unknown or inactive commercial supplier")

    collection = db["commercial_olive_purchases"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await collection.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was used for a different purchase request")
        return prior

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "ACH", session=session
    )
    lines = [
        {
            "variety_id": line.variety_id,
            "quantity_kg": Decimal128(line.quantity_kg),
            "unit_price_dt": Decimal128(line.unit_price_dt),
            "line_total_dt": Decimal128((line.quantity_kg * line.unit_price_dt).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)),
        }
        for line in draft.lines
    ]
    total_quantity = sum((line.quantity_kg for line in draft.lines), start=Decimal("0"))
    total_amount = sum(
        (
            (line.quantity_kg * line.unit_price_dt).quantize(
                Decimal("0.001"), rounding=ROUND_HALF_UP
            )
            for line in draft.lines
        ),
        start=Decimal("0"),
    )
    record = {
        "id": purchase_id,
        "season_code": season_code,
        "document_type": "ACH",
        "document_number": number,
        "supplier_id": draft.supplier_id,
        "purchase_date": draft.purchase_date.isoformat(),
        "lines": lines,
        "total_quantity_kg": Decimal128(total_quantity),
        "total_amount_dt": Decimal128(total_amount),
        "notes": draft.notes,
        "status": "DRAFT",
        "version": 1,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": created_at.astimezone(timezone.utc),
        "updated_at": created_at.astimezone(timezone.utc),
    }
    await collection.insert_one(record, session=session)
    await db["commercial_audit_events"].insert_one(
        {
            "id": audit_event_id,
            "entity_type": "olive_purchase",
            "entity_id": purchase_id,
            "action": "DRAFT_CREATED",
            "actor_user_id": actor_user_id,
            "created_at": created_at.astimezone(timezone.utc),
            "details": {"document_number": number, "supplier_id": draft.supplier_id},
        },
        session=session,
    )
    return record
