"""Append-only quality assessment and explicit oil-lot release workflow.

Call record_oil_quality_assessment only inside run_transaction. Release is a
human decision tied to recorded laboratory measurements and a named
specification; this service deliberately does not invent pass/fail thresholds.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.quality import QualityAssessmentDraft


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _fingerprint(draft: QualityAssessmentDraft) -> str:
    payload = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def record_oil_quality_assessment(
    db: Any,
    draft: QualityAssessmentDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    assessment_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Record lab results and update an oil lot's release state atomically."""
    require_commercial_permission(actor_user, "commercial.manage_quality")
    if not actor_user_id or not assessment_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable ID, and timezone-aware timestamp are required")

    assessments = db["commercial_quality_assessments"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await assessments.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for a different quality assessment")
        return prior

    lots = db["commercial_lots"]
    lot = await lots.find_one({"id": draft.oil_lot_id}, {"_id": 0}, session=session)
    if not lot:
        raise ValueError("Oil lot does not exist")
    if lot.get("product_kind") != "OIL":
        raise ValueError("Quality release applies only to oil lots")
    if lot.get("status") != "OPEN":
        raise ValueError("Only an open oil lot can receive a quality assessment")
    if lot.get("quality_status") not in {"PENDING", "REJECTED"}:
        raise ValueError("Oil lot is already released or has an invalid quality state")
    if lot.get("version", 1) != draft.expected_lot_version:
        raise ValueError("Oil lot version conflict; reload before recording the assessment")

    created_utc = created_at.astimezone(timezone.utc)
    record = {
        "id": assessment_id,
        "season_code": season_code,
        "oil_lot_id": draft.oil_lot_id,
        "sample_reference": draft.sample_reference,
        "sample_date": draft.sample_date.isoformat(),
        "tested_date": draft.tested_date.isoformat(),
        "laboratory_name": draft.laboratory_name,
        "specification_reference": draft.specification_reference,
        "measurements": [
            {"code": item.code, "value": Decimal128(item.value), "unit": item.unit}
            for item in draft.measurements
        ],
        "decision": draft.decision,
        "decision_reason": draft.decision_reason,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": created_utc,
    }
    await assessments.insert_one(record, session=session)

    update = await lots.update_one(
        {
            "id": draft.oil_lot_id,
            "product_kind": "OIL",
            "status": "OPEN",
            "version": draft.expected_lot_version,
            "quality_status": lot.get("quality_status"),
        },
        {
            "$set": {
                "quality_status": draft.decision,
                "last_quality_assessment_id": assessment_id,
                "quality_decided_by": actor_user_id,
                "quality_decided_at": created_utc,
                "updated_at": created_utc,
            },
            "$inc": {"version": 1},
            "$push": {"quality_assessment_ids": assessment_id},
        },
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Oil lot changed concurrently; assessment was not applied")

    await db["commercial_audit_events"].insert_one(
        {
            "id": _stable_id("quality-audit", f"{assessment_id}:{draft.idempotency_key}"),
            "entity_type": "commercial_oil_lot",
            "entity_id": draft.oil_lot_id,
            "action": f"QUALITY_{draft.decision}",
            "actor_user_id": actor_user_id,
            "created_at": created_utc,
            "details": {
                "assessment_id": assessment_id,
                "laboratory_name": draft.laboratory_name,
                "specification_reference": draft.specification_reference,
                "measurement_count": len(draft.measurements),
                "decision_reason": draft.decision_reason,
            },
        },
        session=session,
    )
    result = await assessments.find_one({"id": assessment_id}, {"_id": 0}, session=session)
    return result
