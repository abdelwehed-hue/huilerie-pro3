"""Two-person laboratory recording and independent quality-release workflow.

Both operations must run inside the caller's MongoDB transaction. A lab
submitter cannot release their own assessment; release is a separate,
append-only decision with optimistic lot-version checking.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.quality import QualityAssessmentDraft, QualityReleaseCommand


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _fingerprint(value: Any) -> str:
    payload = json.dumps(value.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def record_oil_quality_assessment(
    db: Any, draft: QualityAssessmentDraft, *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, assessment_id: str,
    created_at: datetime, session: Any,
) -> dict[str, Any]:
    """Record measurements only. This operation cannot release or reject oil."""
    require_commercial_permission(actor_user, "commercial.lab_record")
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
        raise ValueError("Quality assessment applies only to oil lots")
    if lot.get("status") != "OPEN":
        raise ValueError("Only an open oil lot can receive a quality assessment")
    if lot.get("quality_status") not in {"PENDING", "REJECTED"}:
        raise ValueError("Oil lot is already released or has an invalid quality state")
    if lot.get("version", 1) != draft.expected_lot_version:
        raise ValueError("Oil lot version conflict; reload before recording the assessment")

    created_utc = created_at.astimezone(timezone.utc)
    record = {
        "id": assessment_id, "season_code": season_code,
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
        "status": "AWAITING_INDEPENDENT_REVIEW",
        "idempotency_scope": scope, "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint, "created_by": actor_user_id,
        "created_at": created_utc, "lot_version_after_submission": draft.expected_lot_version + 1,
    }
    await assessments.insert_one(record, session=session)
    update = await lots.update_one(
        {"id": draft.oil_lot_id, "product_kind": "OIL", "status": "OPEN",
         "version": draft.expected_lot_version, "quality_status": lot.get("quality_status")},
        {"$set": {"last_quality_assessment_id": assessment_id,
                  "quality_submitted_by": actor_user_id,
                  "quality_submitted_at": created_utc, "updated_at": created_utc},
         "$inc": {"version": 1},
         "$push": {"quality_assessment_ids": assessment_id}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Oil lot changed concurrently; assessment was not applied")

    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("quality-submission-audit", f"{assessment_id}:{draft.idempotency_key}"),
        "entity_type": "commercial_oil_lot", "entity_id": draft.oil_lot_id,
        "action": "QUALITY_RESULTS_SUBMITTED", "actor_user_id": actor_user_id,
        "created_at": created_utc,
        "details": {"assessment_id": assessment_id,
                    "laboratory_name": draft.laboratory_name,
                    "specification_reference": draft.specification_reference,
                    "measurement_count": len(draft.measurements)},
    }, session=session)
    return await assessments.find_one({"id": assessment_id}, {"_id": 0}, session=session)


async def release_oil_quality_assessment(
    db: Any, command: QualityReleaseCommand, *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, release_id: str,
    created_at: datetime, session: Any,
) -> dict[str, Any]:
    """Independent reviewer releases/rejects the latest submitted assessment."""
    require_commercial_permission(actor_user, "commercial.quality_release")
    if not actor_user_id or not release_id or created_at.tzinfo is None:
        raise ValueError("Authenticated reviewer, stable ID, and timezone-aware timestamp are required")

    releases = db["commercial_quality_releases"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(command)
    prior = await releases.find_one(
        {"idempotency_scope": scope, "idempotency_key": command.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for a different release decision")
        return prior

    assessment = await db["commercial_quality_assessments"].find_one(
        {"id": command.assessment_id, "season_code": season_code},
        {"_id": 0}, session=session,
    )
    if not assessment:
        raise ValueError("Quality assessment does not exist")
    if assessment.get("created_by") == actor_user_id:
        raise PermissionError("The laboratory submitter cannot approve their own assessment")
    if assessment.get("status") != "AWAITING_INDEPENDENT_REVIEW":
        raise ValueError("Quality assessment has already been reviewed")
    lot = await db["commercial_lots"].find_one(
        {"id": assessment["oil_lot_id"], "product_kind": "OIL", "status": "OPEN"},
        {"_id": 0}, session=session,
    )
    if not lot:
        raise ValueError("Oil lot does not exist or is not open")
    if lot.get("last_quality_assessment_id") != assessment["id"]:
        raise ValueError("A newer laboratory assessment supersedes this assessment")
    if lot.get("version", 1) != command.expected_lot_version:
        raise ValueError("Oil lot version conflict; reload before reviewing")
    if lot.get("quality_status") not in {"PENDING", "REJECTED"}:
        raise ValueError("Oil lot is already released or has an invalid quality state")

    reviewed_at = created_at.astimezone(timezone.utc)
    release = {
        "id": release_id, "season_code": season_code,
        "assessment_id": assessment["id"], "oil_lot_id": lot["id"],
        "decision": command.decision, "decision_reason": command.decision_reason,
        "submitted_by": assessment["created_by"], "reviewed_by": actor_user_id,
        "idempotency_scope": scope, "idempotency_key": command.idempotency_key,
        "request_fingerprint": fingerprint, "created_at": reviewed_at,
    }
    await releases.insert_one(release, session=session)
    update_lot = await db["commercial_lots"].update_one(
        {"id": lot["id"], "version": command.expected_lot_version,
         "last_quality_assessment_id": assessment["id"],
         "quality_status": lot.get("quality_status")},
        {"$set": {"quality_status": command.decision,
                  "quality_decision_id": release_id,
                  "quality_decided_by": actor_user_id,
                  "quality_decided_at": reviewed_at, "updated_at": reviewed_at},
         "$inc": {"version": 1}},
        session=session,
    )
    if update_lot.matched_count != 1:
        raise ValueError("Oil lot changed concurrently; release decision was not applied")
    update_assessment = await db["commercial_quality_assessments"].update_one(
        {"id": assessment["id"], "status": "AWAITING_INDEPENDENT_REVIEW"},
        {"$set": {"status": "REVIEWED", "decision": command.decision,
                  "decision_reason": command.decision_reason,
                  "reviewed_by": actor_user_id, "reviewed_at": reviewed_at,
                  "release_id": release_id}},
        session=session,
    )
    if update_assessment.matched_count != 1:
        raise ValueError("Quality assessment changed concurrently; release decision was not applied")

    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("quality-release-audit", f"{release_id}:{command.idempotency_key}"),
        "entity_type": "commercial_oil_lot", "entity_id": lot["id"],
        "action": f"QUALITY_{command.decision}", "actor_user_id": actor_user_id,
        "created_at": reviewed_at,
        "details": {"assessment_id": assessment["id"], "release_id": release_id,
                    "submitted_by": assessment["created_by"],
                    "decision_reason": command.decision_reason},
    }, session=session)
    return await releases.find_one({"id": release_id}, {"_id": 0}, session=session)



async def record_olive_quality_assessment(
    db: Any, draft: "OliveQualityAssessmentDraft", *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, assessment_id: str,
    created_at: datetime, session: Any,
) -> dict[str, Any]:
    """Record olive laboratory observations; never mutates lot, stock, or oil-release state."""
    from commercial.schemas.quality import OliveQualityAssessmentDraft

    require_commercial_permission(actor_user, "commercial.lab_record")
    if not actor_user_id or not assessment_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable ID, and timezone-aware timestamp are required")
    assessments = db["commercial_olive_quality_assessments"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await assessments.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for a different olive quality assessment")
        return prior

    lot = await db["commercial_lots"].find_one(
        {"id": draft.olive_lot_id, "product_kind": "OLIVE", "status": "OPEN"},
        {"_id": 0}, session=session,
    )
    if not lot:
        raise ValueError("Open olive lot does not exist")
    if lot.get("season_code") != season_code:
        raise ValueError("Olive lot does not belong to the active season")

    created_utc = created_at.astimezone(timezone.utc)
    record = {
        "id": assessment_id,
        "season_code": season_code,
        "product_kind": "OLIVE",
        "olive_lot_id": draft.olive_lot_id,
        "olive_lot_number": lot.get("document_number"),
        "variety_id": lot.get("variety_id"),
        "sample_reference": draft.sample_reference,
        "sample_date": draft.sample_date.isoformat(),
        "tested_date": draft.tested_date.isoformat(),
        "laboratory_name": draft.laboratory_name,
        "specification_reference": draft.specification_reference,
        "measurements": [
            {"code": item.code, "value": Decimal128(item.value), "unit": item.unit}
            for item in draft.measurements
        ],
        "status": "RECORDED",
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": created_utc,
    }
    await assessments.insert_one(record, session=session)
    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("olive-quality-audit", f"{assessment_id}:{draft.idempotency_key}"),
        "entity_type": "commercial_olive_lot",
        "entity_id": draft.olive_lot_id,
        "action": "OLIVE_QUALITY_RESULTS_RECORDED",
        "actor_user_id": actor_user_id,
        "created_at": created_utc,
        "details": {
            "assessment_id": assessment_id,
            "sample_reference": draft.sample_reference,
            "laboratory_name": draft.laboratory_name,
            "specification_reference": draft.specification_reference,
            "measurement_count": len(draft.measurements),
        },
    }, session=session)
    return await assessments.find_one({"id": assessment_id}, {"_id": 0}, session=session)
