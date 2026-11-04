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
from commercial.services.numbering import reserve_document_number, reserve_batch_code
from lib.season import DEFAULT_VARIETIES


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

    variety_ids = sorted({line.variety_id for line in draft.lines})
    settings_doc = await db["settings"].find_one(
        {"key": "app"}, {"_id": 0, "varieties": 1}, session=session,
    ) or {}
    configured_varieties = settings_doc.get("varieties") or DEFAULT_VARIETIES
    active_varieties = {
        str(name).strip() for name in configured_varieties
        if isinstance(name, str) and str(name).strip()
    }
    if not set(variety_ids).issubset(active_varieties):
        raise ValueError("One or more olive varieties are unknown or inactive")

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
    # One traceability code belongs to the whole purchase, not to each line.
    batch_code = await reserve_batch_code(
        db["commercial_counters"], season_code, session=session
    )
    lines = []
    for line in draft.lines:
        lines.append({
            "variety_id": line.variety_id,
            "batch_code": batch_code,
            "quantity_kg": Decimal128(line.quantity_kg),
            "unit_price_dt": Decimal128(line.unit_price_dt),
            "line_total_dt": Decimal128((line.quantity_kg * line.unit_price_dt).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)),
        })
    batch_codes = [batch_code]
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
        "batch_code": batch_code,
        "batch_codes": batch_codes,
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
            "details": {
                "document_number": number,
                "supplier_id": draft.supplier_id,
                "purchase_date": draft.purchase_date.isoformat(),
                "lines": lines,
                "total_quantity_kg": Decimal128(total_quantity),
                "total_amount_dt": Decimal128(total_amount),
                "notes": draft.notes,
                "status": "DRAFT",
            },
        },
        session=session,
    )
    return record


async def update_olive_purchase_draft(
    db: Any,
    purchase_id: str,
    draft: Any,
    *,
    actor_user: dict[str, Any],
    actor_user_id: str,
    audit_event_id: str,
    updated_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Update only a DRAFT purchase; approved receipts are immutable."""
    require_commercial_permission(actor_user, "commercial.manage_purchases")
    purchases = db["commercial_olive_purchases"]
    existing = await purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
    if not existing:
        raise ValueError("Olive purchase does not exist")
    if existing.get("status") != "DRAFT":
        raise ValueError("Only draft olive purchases can be edited")
    if int(existing.get("version", 1)) != draft.expected_version:
        raise ValueError("Olive purchase version conflict")

    supplier = await db["commercial_suppliers"].find_one(
        {"id": draft.supplier_id, "active": True}, {"_id": 0, "id": 1}, session=session
    )
    if not supplier:
        raise ValueError("Unknown or inactive commercial supplier")
    settings_doc = await db["settings"].find_one(
        {"key": "app"}, {"_id": 0, "varieties": 1}, session=session
    ) or {}
    configured = settings_doc.get("varieties") or DEFAULT_VARIETIES
    active_varieties = {
        str(name).strip() for name in configured
        if isinstance(name, str) and str(name).strip()
    }
    if not {line.variety_id for line in draft.lines}.issubset(active_varieties):
        raise ValueError("One or more olive varieties are unknown or inactive")

    # Keep the purchase's single traceability code when editing its draft.
    # Legacy drafts are normalized to one code at the purchase level.
    batch_code = existing.get("batch_code") or next(
        (str(item.get("batch_code")) for item in existing.get("lines", []) if item.get("batch_code")),
        None,
    )
    if not batch_code:
        batch_code = await reserve_batch_code(
            db["commercial_counters"], existing["season_code"], session=session
        )
    lines = []
    for line in draft.lines:
        lines.append({
            "variety_id": line.variety_id,
            "batch_code": batch_code,
            "quantity_kg": Decimal128(line.quantity_kg),
            "unit_price_dt": Decimal128(line.unit_price_dt),
            "line_total_dt": Decimal128((line.quantity_kg * line.unit_price_dt).quantize(
                Decimal("0.001"), rounding=ROUND_HALF_UP
            )),
        })
    batch_codes = [batch_code]
    total_quantity = sum((line.quantity_kg for line in draft.lines), start=Decimal("0"))
    total_amount = sum((
        (line.quantity_kg * line.unit_price_dt).quantize(
            Decimal("0.001"), rounding=ROUND_HALF_UP
        ) for line in draft.lines
    ), start=Decimal("0"))
    now = updated_at.astimezone(timezone.utc)
    result = await purchases.update_one(
        {"id": purchase_id, "status": "DRAFT", "version": draft.expected_version},
        {"$set": {
            "supplier_id": draft.supplier_id,
            "purchase_date": draft.purchase_date.isoformat(),
            "lines": lines,
            "batch_code": batch_code,
            "batch_codes": batch_codes,
            "total_quantity_kg": Decimal128(total_quantity),
            "total_amount_dt": Decimal128(total_amount),
            "notes": draft.notes,
            "updated_at": now,
            "updated_by": actor_user_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if result.matched_count != 1:
        raise ValueError("Olive purchase changed concurrently; reload and retry")
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id,
        "entity_type": "olive_purchase",
        "entity_id": purchase_id,
        "action": "DRAFT_UPDATED",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "document_number": existing.get("document_number"),
            "previous_version": draft.expected_version,
            "new_version": draft.expected_version + 1,
            "previous_supplier_id": existing.get("supplier_id"),
            "new_supplier_id": draft.supplier_id,
            "previous_purchase_date": existing.get("purchase_date"),
            "new_purchase_date": draft.purchase_date.isoformat(),
            "previous_lines": existing.get("lines", []),
            "new_lines": lines,
            "previous_batch_codes": [line.get("batch_code") for line in existing.get("lines", [])],
            "new_batch_codes": batch_codes,
            "previous_quantity_kg": existing.get("total_quantity_kg"),
            "new_quantity_kg": Decimal128(total_quantity),
            "previous_total_amount_dt": existing.get("total_amount_dt"),
            "new_total_amount_dt": Decimal128(total_amount),
            "previous_notes": existing.get("notes"),
            "new_notes": draft.notes,
        },
    }, session=session)
    return await purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
