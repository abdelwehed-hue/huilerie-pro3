"""Transactional preproduction trituration sample workflow."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.preproduction import PreproductionSampleDraft
from commercial.schemas.inventory import StockMovementDraft
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _owner_document(owner: dict[str, Any]) -> dict[str, Any]:
    result = {"kind": owner.get("kind")}
    if owner.get("customer_id") is not None:
        result["customer_id"] = owner["customer_id"]
    return result


def _fingerprint(draft: Any) -> str:
    payload = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _movement_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def create_preproduction_sample(
    db: Any, draft: PreproductionSampleDraft, *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, sample_id: str,
    oil_lot_id: str, movement_id: str, movement_audit_id: str,
    created_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_preproduction_samples")
    if not actor_user_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor and timezone-aware timestamp are required")
    collection = db["commercial_preproduction_samples"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await collection.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for another preproduction trial")
        return prior

    source_lot = await db["commercial_lots"].find_one(
        {"id": draft.source_olive_lot_id, "product_kind": "OLIVE", "status": "OPEN"},
        {"_id": 0}, session=session,
    )
    if not source_lot:
        raise ValueError("Source olive lot does not exist or is not open")
    if source_lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE":
        raise ValueError("A laboratory sample cannot be used as an olive input")
    location = await db["commercial_locations"].find_one(
        {"id": draft.source_location_id, "active": True, "kind": {"$in": ["OLIVE_STORAGE", "STAGING"]}},
        {"_id": 0, "id": 1}, session=session,
    )
    if not location:
        raise ValueError("Source location is not an active olive receiving/storage location")
    owner = {"kind": draft.owner.kind}
    if draft.owner.customer_id is not None:
        owner["customer_id"] = draft.owner.customer_id
    if draft.owner.kind == "CUSTOMER":
        if not draft.owner.customer_id:
            raise ValueError("Customer-owned olive stock has no customer identity")
        if not await db["commercial_custody_owners"].find_one({"id": draft.owner.customer_id}, {"_id": 0, "id": 1}, session=session):
            raise ValueError("Selected olive stock customer owner does not exist")

    balance = await db["commercial_stock_balances"].find_one({
        "product_kind": "OLIVE", "lot_id": draft.source_olive_lot_id,
        "owner.kind": draft.owner.kind, "owner.customer_id": draft.owner.customer_id,
        "location_id": draft.source_location_id,
    }, {"_id": 0, "quantity_kg": 1}, session=session)
    available = balance.get("quantity_kg") if balance else None
    available_decimal = available.to_decimal() if hasattr(available, "to_decimal") else Decimal(str(available or "0"))
    if draft.input_olive_quantity_kg > available_decimal:
        raise ValueError("Trial input exceeds the olive quantity available at the selected receiving location")
    if draft.sample_oil_quantity_kg > draft.input_olive_quantity_kg:
        raise ValueError("Trial oil output cannot exceed the olive input mass")

    # Do not start another trial while the current trial is awaiting analysis/review.
    latest_sample_id = source_lot.get("latest_preproduction_sample_id")
    if latest_sample_id:
        latest_sample = await collection.find_one({"id": latest_sample_id}, {"_id": 0, "oil_sample_lot_id": 1, "status": 1}, session=session)
        if latest_sample and latest_sample.get("status") == "COMPLETED":
            latest_assessment = await db["commercial_quality_assessments"].find_one(
                {"oil_lot_id": latest_sample.get("oil_sample_lot_id"), "status": "AWAITING_INDEPENDENT_REVIEW"},
                {"_id": 0, "id": 1}, session=session,
            )
            sample_oil_lot = await db["commercial_lots"].find_one(
                {"id": latest_sample.get("oil_sample_lot_id")}, {"_id": 0, "quality_status": 1}, session=session,
            )
            if latest_assessment or (sample_oil_lot and sample_oil_lot.get("quality_status") == "PENDING"):
                raise ValueError("The latest preproduction trial is still awaiting laboratory analysis or independent review")

    # A new trial invalidates every previous approval before the new analysis.
    source_update = await db["commercial_lots"].update_one(
        {"id": draft.source_olive_lot_id, "product_kind": "OLIVE", "status": "OPEN",
         "latest_preproduction_sample_id": latest_sample_id},
        {"$set": {"preproduction_quality_status": "PENDING", "latest_preproduction_sample_id": sample_id, "updated_at": created_at.astimezone(timezone.utc)},
         "$unset": {"preproduction_sample_id": "", "preproduction_quality_assessment_id": "",
                    "preproduction_quality_decided_at": "", "preproduction_quality_decided_by": ""},
         "$inc": {"version": 1}},
        session=session,
    )
    if source_update.matched_count != 1:
        raise ValueError("Source olive lot changed during trial creation; reload and retry")
    document_number = await reserve_document_number(db["commercial_counters"], season_code, "ESS", session=session)
    oil_lot_number = await reserve_document_number(db["commercial_counters"], season_code, "LOT", session=session)
    created_utc = created_at.astimezone(timezone.utc)
    record = {
        "id": sample_id, "season_code": season_code, "document_type": "ESS",
        "document_number": document_number, "status": "COMPLETED",
        "source_olive_lot_id": draft.source_olive_lot_id,
        "source_location_id": draft.source_location_id,
        "owner": _owner_document(owner),
        "input_olive_quantity_kg": Decimal128(draft.input_olive_quantity_kg),
        "sample_oil_quantity_kg": Decimal128(draft.sample_oil_quantity_kg),
        "oil_sample_lot_id": oil_lot_id, "stock_movement_id": movement_id,
        "trial_date": draft.trial_date.isoformat(), "notes": draft.notes,
        "created_by": actor_user_id, "created_at": created_utc,
        "idempotency_scope": scope, "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
    }
    await collection.insert_one(record, session=session)
    sample_lot = {
        "id": oil_lot_id, "season_code": season_code, "document_type": "LOT",
        "document_number": oil_lot_number, "product_kind": "OIL",
        "lot_purpose": "PREPRODUCTION_SAMPLE", "source_preproduction_sample_id": sample_id,
        "source_olive_lot_id": draft.source_olive_lot_id,
        "quantity_received_kg": Decimal128(draft.sample_oil_quantity_kg),
        "owner": _owner_document(owner), "quality_status": "PENDING", "status": "OPEN",
        "version": 1, "created_by": actor_user_id, "created_at": created_utc,
    }
    await db["commercial_lots"].insert_one(sample_lot, session=session)

    movement_key = f"{sample_id}:consume-olive"
    await post_stock_movement(
        db,
        StockMovementDraft(
            movement_kind="CONSUMPTION", product_kind="OLIVE",
            lot_id=draft.source_olive_lot_id, quantity_kg=draft.input_olive_quantity_kg,
            source_location_id=draft.source_location_id,
            source_owner=draft.owner,
            source_document_type="ESS", source_document_id=sample_id,
            idempotency_key=_movement_key(movement_key),
            reason=f"Olive consumed for preproduction trial {document_number}",
        ),
        season_code=season_code, actor_user_id=actor_user_id, actor_user=actor_user,
        movement_id=movement_id, audit_event_id=movement_audit_id,
        created_at=created_utc, session=session,
    )
    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("preproduction-sample-audit", sample_id),
        "entity_type": "commercial_preproduction_sample", "entity_id": sample_id,
        "action": "PREPRODUCTION_TRIAL_COMPLETED", "actor_user_id": actor_user_id,
        "created_at": created_utc,
        "details": {
            "document_number": document_number, "source_olive_lot_id": draft.source_olive_lot_id,
            "input_olive_quantity_kg": Decimal128(draft.input_olive_quantity_kg),
            "sample_oil_lot_id": oil_lot_id, "sample_oil_quantity_kg": Decimal128(draft.sample_oil_quantity_kg),
            "stock_movement_id": movement_id,
            "superseded_sample_id": source_lot.get("preproduction_sample_id") or source_lot.get("latest_preproduction_sample_id"),
            "superseded_assessment_id": source_lot.get("preproduction_quality_assessment_id"),
            "superseded_quality_status": source_lot.get("preproduction_quality_status"),
        },
    }, session=session)
    return record


async def cancel_preproduction_sample(
    db: Any, sample_id: str, reason: str, *, actor_user: dict[str, Any],
    actor_user_id: str, cancelled_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_preproduction_samples")
    if len(reason.strip()) < 5 or cancelled_at.tzinfo is None:
        raise ValueError("A cancellation reason and timezone-aware timestamp are required")
    sample = await db["commercial_preproduction_samples"].find_one(
        {"id": sample_id}, {"_id": 0}, session=session,
    )
    if not sample:
        raise ValueError("Preproduction trial does not exist")
    if sample.get("status") != "COMPLETED":
        raise ValueError("Only a completed trial can be cancelled")
    sample_oil_lot = await db["commercial_lots"].find_one(
        {"id": sample.get("oil_sample_lot_id"), "lot_purpose": "PREPRODUCTION_SAMPLE",
         "status": "OPEN", "quality_status": "REJECTED"},
        {"_id": 0, "id": 1, "last_quality_assessment_id": 1}, session=session,
    )
    if not sample_oil_lot or not sample_oil_lot.get("last_quality_assessment_id"):
        raise ValueError("Only a currently rejected preproduction sample can be cancelled")
    assessment = await db["commercial_quality_assessments"].find_one(
        {"id": sample_oil_lot["last_quality_assessment_id"],
         "oil_lot_id": sample.get("oil_sample_lot_id"),
         "status": "REVIEWED", "decision": "REJECTED"},
        {"_id": 0, "id": 1}, session=session,
    )
    if not assessment:
        raise ValueError("Only the latest rejected preproduction assessment can be cancelled")
    now = cancelled_at.astimezone(timezone.utc)
    update = await db["commercial_preproduction_samples"].update_one(
        {"id": sample_id, "status": "COMPLETED"},
        {"$set": {"status": "CANCELLED", "cancel_reason": reason.strip(),
                  "cancelled_by": actor_user_id, "cancelled_at": now}}, session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Preproduction trial changed concurrently")
    cancelled_lot = await db["commercial_lots"].update_one(
        {"id": sample.get("oil_sample_lot_id"), "lot_purpose": "PREPRODUCTION_SAMPLE",
         "status": "OPEN", "quality_status": "REJECTED",
         "last_quality_assessment_id": assessment["id"]},
        {"$set": {"status": "CANCELLED", "updated_at": now}, "$inc": {"version": 1}},
        session=session,
    )
    if cancelled_lot.matched_count != 1:
        raise ValueError("Preproduction sample lot changed; cancellation was not applied")
    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("preproduction-sample-cancel-audit", sample_id),
        "entity_type": "commercial_preproduction_sample", "entity_id": sample_id,
        "action": "PREPRODUCTION_TRIAL_CANCELLED", "actor_user_id": actor_user_id,
        "created_at": now, "details": {"reason": reason.strip(), "assessment_id": assessment["id"]},
    }, session=session)
    return {"id": sample_id, "status": "CANCELLED", "cancel_reason": reason.strip()}
