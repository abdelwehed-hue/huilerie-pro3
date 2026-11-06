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

def _quality_snapshot(record: dict[str, Any]) -> dict[str, Any]:
    """Return business-relevant measurements and review state for audit history."""
    fields = (
        "oil_lot_id", "batch_code", "lot_purpose", "source_preproduction_sample_id", "source_olive_lot_id", "sample_reference", "sample_date", "tested_date",
        "laboratory_name", "specification_reference", "acidity", "peroxide",
        "k232", "k270", "oil_content_pct", "classification", "oil_type",
        "measurements", "notes", "status", "decision", "decision_reason",
        "quality_status_before_submission", "supersedes_assessment_id",
    )
    return {key: record.get(key) for key in fields if key in record}


async def record_oil_quality_assessment(
    db: Any, draft: QualityAssessmentDraft, *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, assessment_id: str,
    created_at: datetime, session: Any,
    correction_of_assessment_id: str | None = None,
) -> dict[str, Any]:
    """Record new measurements; corrections create a reviewable revision."""
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
    superseded_assessment = None
    if correction_of_assessment_id:
        superseded_assessment = await assessments.find_one(
            {"id": correction_of_assessment_id, "season_code": season_code},
            {"_id": 0}, session=session,
        )
        if (
            not superseded_assessment
            or superseded_assessment.get("status") != "REVIEWED"
            or superseded_assessment.get("decision") != "RELEASED"
            or superseded_assessment.get("oil_lot_id") != lot["id"]
            or lot.get("last_quality_assessment_id") != correction_of_assessment_id
            or lot.get("quality_status") != "RELEASED"
        ):
            raise ValueError("Only the latest released commercial oil analysis can be corrected")
        release = await db["commercial_quality_releases"].find_one(
            {"id": lot.get("quality_decision_id"), "assessment_id": correction_of_assessment_id,
             "oil_lot_id": lot["id"], "decision": "RELEASED"},
            {"_id": 0, "id": 1}, session=session,
        )
        if not release:
            raise ValueError("A recorded release is required before correcting this analysis")
        if lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE":
            sample_id = lot.get("source_preproduction_sample_id")
            source_lot = await lots.find_one(
                {"id": lot.get("source_olive_lot_id"), "product_kind": "OLIVE",
                 "status": "OPEN", "latest_preproduction_sample_id": sample_id,
                 "preproduction_quality_status": "RELEASED",
                 "preproduction_quality_assessment_id": correction_of_assessment_id},
                {"_id": 0, "id": 1}, session=session,
            )
            if not source_lot:
                raise ValueError("The preproduction approval is no longer current")
    elif lot.get("quality_status") not in {"PENDING", "REJECTED"}:
        raise ValueError("Oil lot is already released or has an invalid quality state")
    if lot.get("version", 1) != draft.expected_lot_version:
        raise ValueError("Oil lot version conflict; reload before recording the assessment")
    source_olive_lot = None
    if lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE":
        sample_id = lot.get("source_preproduction_sample_id")
        source_olive_lot = await db["commercial_lots"].find_one(
            {"id": lot.get("source_olive_lot_id"), "product_kind": "OLIVE",
             "status": "OPEN", "latest_preproduction_sample_id": sample_id},
            {"_id": 0, "id": 1}, session=session,
        )
        sample = await db["commercial_preproduction_samples"].find_one(
            {"id": sample_id, "source_olive_lot_id": lot.get("source_olive_lot_id"),
             "oil_sample_lot_id": lot["id"], "status": "COMPLETED"},
            {"_id": 0, "id": 1}, session=session,
        )
        if not sample_id or not source_olive_lot or not sample:
            raise ValueError("Only the latest active preproduction trial sample can be analysed")
        expected_sample_reference = str(source_olive_lot.get("batch_code") or lot.get("batch_code") or "").strip()
        if not expected_sample_reference or draft.sample_reference.strip() != expected_sample_reference:
            raise ValueError("Sample reference must match the unified source olive batch code")
        mill_settings = await db["settings"].find_one({"key": "app"}, {"_id": 0, "mill_name": 1}, session=session)
        expected_laboratory_name = str((mill_settings or {}).get("mill_name") or "").strip() or "Labo Oroverde"
        if draft.laboratory_name.strip() != expected_laboratory_name:
            raise ValueError("Laboratory must match the mill name configured in Campaign settings")

    created_utc = created_at.astimezone(timezone.utc)
    record = {
        "id": assessment_id, "season_code": season_code,
        "oil_lot_id": draft.oil_lot_id,
        "batch_code": lot.get("batch_code"),
        "lot_purpose": lot.get("lot_purpose"),
        "source_preproduction_sample_id": lot.get("source_preproduction_sample_id"),
        "source_olive_lot_id": lot.get("source_olive_lot_id"),
        "sample_reference": expected_sample_reference if lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE" else draft.sample_reference,
        "sample_date": draft.sample_date.isoformat(),
        "tested_date": draft.tested_date.isoformat(),
        "laboratory_name": expected_laboratory_name if lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE" else draft.laboratory_name,
        "specification_reference": draft.specification_reference,
        "acidity": Decimal128(draft.acidity) if draft.acidity is not None else None,
        "peroxide": Decimal128(draft.peroxide) if draft.peroxide is not None else None,
        "k232": Decimal128(draft.k232) if draft.k232 is not None else None,
        "k270": Decimal128(draft.k270) if draft.k270 is not None else None,
        "oil_content_pct": Decimal128(draft.oil_content_pct) if draft.oil_content_pct is not None else None,
        "classification": draft.classification,
        "oil_type": draft.oil_type.strip() if draft.oil_type else None,
        "notes": draft.notes,
        "measurements": [
            {"code": item.code, "value": Decimal128(item.value), "unit": item.unit}
            for item in draft.measurements
        ],
        "status": "AWAITING_INDEPENDENT_REVIEW",
        "quality_status_before_submission": lot.get("quality_status", "PENDING"),
        "supersedes_assessment_id": correction_of_assessment_id,
        "idempotency_scope": scope, "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint, "created_by": actor_user_id,
        "created_at": created_utc, "lot_version_after_submission": draft.expected_lot_version + 1,
    }
    await assessments.insert_one(record, session=session)
    lot_update: dict[str, Any] = {
        "$set": {"last_quality_assessment_id": assessment_id,
                 "quality_submitted_by": actor_user_id,
                 "quality_submitted_at": created_utc, "updated_at": created_utc},
        "$inc": {"version": 1},
        "$push": {"quality_assessment_ids": assessment_id},
    }
    if correction_of_assessment_id:
        lot_update["$set"]["quality_status"] = "PENDING"
        lot_update["$unset"] = {
            "quality_decision_id": "", "quality_decided_by": "", "quality_decided_at": "",
        }
    update = await lots.update_one(
        {"id": draft.oil_lot_id, "product_kind": "OIL", "status": "OPEN",
         "version": draft.expected_lot_version, "quality_status": lot.get("quality_status")},
        lot_update,
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Oil lot changed concurrently; assessment was not applied")
    if correction_of_assessment_id and lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE":
        source_update = await lots.update_one(
            {"id": lot["source_olive_lot_id"], "product_kind": "OLIVE", "status": "OPEN",
             "latest_preproduction_sample_id": lot["source_preproduction_sample_id"],
             "preproduction_quality_status": "RELEASED",
             "preproduction_quality_assessment_id": correction_of_assessment_id},
            {"$set": {"preproduction_quality_status": "PENDING", "updated_at": created_utc},
             "$unset": {"preproduction_quality_decided_by": "", "preproduction_quality_decided_at": ""},
             "$inc": {"version": 1}},
            session=session,
        )
        if source_update.matched_count != 1:
            raise ValueError("Preproduction approval changed concurrently; correction was not applied")

    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("quality-submission-audit", f"{assessment_id}:{draft.idempotency_key}"),
        "entity_type": "commercial_oil_lot", "entity_id": draft.oil_lot_id,
        "action": "QUALITY_RESULTS_SUBMITTED", "actor_user_id": actor_user_id,
        "created_at": created_utc,
        "details": {
            "assessment_id": assessment_id,
            "lot_quality_status_before": lot.get("quality_status", "PENDING"),
            "assessment_after": _quality_snapshot(record),
        },
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

    if lot.get("lot_purpose") == "PREPRODUCTION_SAMPLE":
        source_olive_lot_id = lot.get("source_olive_lot_id")
        sample_id = lot.get("source_preproduction_sample_id")
        if not source_olive_lot_id or not sample_id:
            raise ValueError("Preproduction sample is missing its source olive-lot linkage")
        source_update = await db["commercial_lots"].update_one(
            {"id": source_olive_lot_id, "product_kind": "OLIVE", "status": "OPEN",
             "latest_preproduction_sample_id": sample_id},
            {"$set": {
                "preproduction_quality_status": command.decision,
                "preproduction_sample_id": sample_id,
                "preproduction_quality_assessment_id": assessment["id"],
                "preproduction_quality_decided_at": reviewed_at,
                "preproduction_quality_decided_by": actor_user_id,
                "updated_at": reviewed_at,
            }}, session=session,
        )
        if source_update.matched_count != 1:
            raise ValueError("Source olive lot changed or is no longer open; quality decision cannot authorize production")

    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("quality-release-audit", f"{release_id}:{command.idempotency_key}"),
        "entity_type": "commercial_oil_lot", "entity_id": lot["id"],
        "action": f"QUALITY_{command.decision}", "actor_user_id": actor_user_id,
        "created_at": reviewed_at,
        "details": {
            "assessment_id": assessment["id"],
            "release_id": release_id,
            "submitted_by": assessment["created_by"],
            "lot_quality_status_before": lot.get("quality_status"),
            "lot_quality_status_after": command.decision,
            "assessment_before": _quality_snapshot(assessment),
            "assessment_after": {
                **_quality_snapshot(assessment),
                "status": "REVIEWED",
                "decision": command.decision,
                "decision_reason": command.decision_reason,
                "reviewed_by": actor_user_id,
                "reviewed_at": reviewed_at,
            },
        },
    }, session=session)
    return await releases.find_one({"id": release_id}, {"_id": 0}, session=session)


async def update_oil_quality_assessment(
    db: Any, assessment_id: str, draft: QualityAssessmentDraft, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    updated_at: datetime, session: Any,
) -> dict[str, Any]:
    """Edit only the latest assessment while it is still awaiting review."""
    require_commercial_permission(actor_user, "commercial.lab_record")
    if not actor_user_id or updated_at.tzinfo is None:
        raise ValueError("Authenticated actor and timezone-aware timestamp are required")
    assessments = db["commercial_quality_assessments"]
    assessment = await assessments.find_one(
        {"id": assessment_id, "season_code": season_code}, {"_id": 0}, session=session
    )
    if not assessment:
        raise ValueError("Quality assessment does not exist")
    if assessment.get("status") != "AWAITING_INDEPENDENT_REVIEW":
        raise ValueError("Reviewed assessments are immutable; create a new assessment instead")
    if assessment.get("created_by") != actor_user_id and actor_user.get("role") != "admin":
        raise PermissionError("Only the submitting analyst or an administrator can edit this assessment")
    if draft.oil_lot_id != assessment.get("oil_lot_id"):
        raise ValueError("An assessment cannot be moved to another oil lot")
    lot = await db["commercial_lots"].find_one(
        {"id": assessment["oil_lot_id"], "product_kind": "OIL", "status": "OPEN"},
        {"_id": 0}, session=session,
    )
    if not lot or lot.get("last_quality_assessment_id") != assessment_id:
        raise ValueError("Only the latest assessment for an open oil lot can be edited")
    if lot.get("version", 1) != draft.expected_lot_version:
        raise ValueError("Oil lot version conflict; reload before editing")
    if lot.get("quality_status") not in {"PENDING", "REJECTED"}:
        raise ValueError("The oil lot is no longer awaiting quality review")

    updated_at = updated_at.astimezone(timezone.utc)
    fields = {
        "sample_reference": draft.sample_reference,
        "sample_date": draft.sample_date.isoformat(),
        "tested_date": draft.tested_date.isoformat(),
        "laboratory_name": draft.laboratory_name,
        "specification_reference": draft.specification_reference,
        "acidity": Decimal128(draft.acidity) if draft.acidity is not None else None,
        "peroxide": Decimal128(draft.peroxide) if draft.peroxide is not None else None,
        "k232": Decimal128(draft.k232) if draft.k232 is not None else None,
        "k270": Decimal128(draft.k270) if draft.k270 is not None else None,
        "oil_content_pct": Decimal128(draft.oil_content_pct) if draft.oil_content_pct is not None else None,
        "classification": draft.classification,
        "oil_type": draft.oil_type.strip() if draft.oil_type else None,
        "notes": draft.notes,
        "measurements": [
            {"code": item.code, "value": Decimal128(item.value), "unit": item.unit}
            for item in draft.measurements
        ],
        "updated_at": updated_at,
        "updated_by": actor_user_id,
    }
    changed = await assessments.update_one(
        {"id": assessment_id, "status": "AWAITING_INDEPENDENT_REVIEW"},
        {"$set": fields}, session=session,
    )
    if changed.matched_count != 1:
        raise ValueError("Assessment changed concurrently; reload before editing")
    lot_update = await db["commercial_lots"].update_one(
        {"id": lot["id"], "version": draft.expected_lot_version,
         "last_quality_assessment_id": assessment_id},
        {"$inc": {"version": 1}, "$set": {"updated_at": updated_at}},
        session=session,
    )
    if lot_update.matched_count != 1:
        raise ValueError("Oil lot changed concurrently; edit was not applied")
    await assessments.update_one(
        {"id": assessment_id}, {"$set": {"lot_version_after_submission": draft.expected_lot_version + 1}},
        session=session,
    )
    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("quality-edit-audit", f"{assessment_id}:{updated_at.isoformat()}"),
        "entity_type": "commercial_oil_lot", "entity_id": lot["id"],
        "action": "QUALITY_ASSESSMENT_UPDATED", "actor_user_id": actor_user_id,
        "created_at": updated_at,
        "details": {
            "assessment_id": assessment_id,
            "assessment_before": _quality_snapshot(assessment),
            "assessment_after": _quality_snapshot({**assessment, **fields}),
            "lot_version_before": draft.expected_lot_version,
            "lot_version_after": draft.expected_lot_version + 1,
        },
    }, session=session)
    return await assessments.find_one({"id": assessment_id}, {"_id": 0}, session=session)


async def delete_oil_quality_assessment(
    db: Any, assessment_id: str, *, season_code: str, actor_user: dict[str, Any],
    actor_user_id: str, deleted_at: datetime, session: Any,
) -> dict[str, Any]:
    """Delete only an unreviewed latest assessment and restore its prior lot state."""
    require_commercial_permission(actor_user, "commercial.lab_record")
    if not actor_user_id or deleted_at.tzinfo is None:
        raise ValueError("Authenticated actor and timezone-aware timestamp are required")
    assessments = db["commercial_quality_assessments"]
    assessment = await assessments.find_one(
        {"id": assessment_id, "season_code": season_code}, {"_id": 0}, session=session
    )
    if not assessment:
        raise ValueError("Quality assessment does not exist")
    if assessment.get("status") != "AWAITING_INDEPENDENT_REVIEW":
        raise ValueError("Reviewed assessments cannot be deleted; audit decisions must remain immutable")
    if assessment.get("created_by") != actor_user_id and actor_user.get("role") != "admin":
        raise PermissionError("Only the submitting analyst or an administrator can delete this assessment")
    if assessment.get("supersedes_assessment_id"):
        raise ValueError("A submitted correction cannot be deleted; edit it and submit it for review")
    previous_status = assessment.get("quality_status_before_submission")
    if previous_status not in {"PENDING", "REJECTED"}:
        raise ValueError("This legacy assessment has no safe prior quality state; it cannot be deleted")
    lot = await db["commercial_lots"].find_one(
        {"id": assessment["oil_lot_id"], "product_kind": "OIL", "status": "OPEN"},
        {"_id": 0}, session=session,
    )
    if not lot or lot.get("last_quality_assessment_id") != assessment_id:
        raise ValueError("Only the latest assessment for an open oil lot can be deleted")
    deleted_at = deleted_at.astimezone(timezone.utc)
    update = await db["commercial_lots"].update_one(
        {"id": lot["id"], "version": lot.get("version", 1), "last_quality_assessment_id": assessment_id},
        {"$set": {"quality_status": previous_status, "updated_at": deleted_at},
         "$unset": {"last_quality_assessment_id": "", "quality_submitted_by": "", "quality_submitted_at": ""},
         "$pull": {"quality_assessment_ids": assessment_id}, "$inc": {"version": 1}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Oil lot changed concurrently; deletion was not applied")
    await assessments.delete_one({"id": assessment_id, "status": "AWAITING_INDEPENDENT_REVIEW"}, session=session)
    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("quality-delete-audit", f"{assessment_id}:{deleted_at.isoformat()}"),
        "entity_type": "commercial_oil_lot", "entity_id": lot["id"],
        "action": "QUALITY_ASSESSMENT_DELETED", "actor_user_id": actor_user_id,
        "created_at": deleted_at,
        "details": {
            "assessment_id": assessment_id,
            "assessment_before": _quality_snapshot(assessment),
            "assessment_after": None,
            "lot_quality_status_before": lot.get("quality_status"),
            "lot_quality_status_after": previous_status,
            "lot_version_before": lot.get("version", 1),
            "lot_version_after": lot.get("version", 1) + 1,
        },
    }, session=session)
    return {"id": assessment_id, "deleted": True, "restored_quality_status": previous_status}
