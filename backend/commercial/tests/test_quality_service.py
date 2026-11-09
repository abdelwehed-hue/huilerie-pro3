from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from commercial.schemas.quality import QualityAssessmentDraft, QualityReleaseCommand
from commercial.services.quality import record_oil_quality_assessment, release_oil_quality_assessment


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length=None):
        return self.rows[:length] if length is not None else list(self.rows)


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def find(self, query, projection=None, session=None):
        def matches(row):
            for key, expected in query.items():
                actual = row.get(key)
                if isinstance(expected, dict) and "$in" in expected:
                    if actual not in expected["$in"]:
                        return False
                elif actual != expected:
                    return False
            return True
        return Cursor([row for row in self.rows if matches(row)])

    async def find_one(self, query, projection=None, session=None):
        return next((row for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, row, session=None):
        self.rows.append(dict(row))
        return SimpleNamespace(inserted_id=row.get("id"))

    async def update_one(self, query, update, session=None):
        row = next((row for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)
        if row is None:
            return SimpleNamespace(matched_count=0)
        row.update(update.get("$set", {}))
        for key, value in update.get("$inc", {}).items():
            row[key] = row.get(key, 0) + value
        for key, value in update.get("$push", {}).items():
            row.setdefault(key, []).append(value)
        return SimpleNamespace(matched_count=1)

    async def update_many(self, query, update, session=None):
        matched = [row for row in self.rows if all(
            row.get(key) in expected["$in"] if isinstance(expected, dict) and "$in" in expected
            else row.get(key) == expected
            for key, expected in query.items()
        )]
        for row in matched:
            row.update(update.get("$set", {}))
        return SimpleNamespace(matched_count=len(matched))


class Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


def make_draft():
    return QualityAssessmentDraft(
        oil_lot_id="oil-1", expected_lot_version=1,
        sample_reference="SAMPLE-001", sample_date=date(2026, 11, 2),
        tested_date=date(2026, 11, 2), laboratory_name="Accredited Lab",
        specification_reference="SPEC-2026-A",
        measurements=[
            {"code": "ACIDITY", "value": "0.35", "unit": "%"},
            {"code": "PEROXIDE", "value": "8.2", "unit": "meq O2/kg"},
        ],
        idempotency_key="quality-service-test-0001",
    )


def make_db():
    return Database({
        "commercial_lots": Collection([{
            "id": "oil-1", "product_kind": "OIL", "status": "OPEN",
            "quality_status": "PENDING", "version": 1,
        }]),
        "settings": Collection([{"key": "app", "mill_name": "Oro Verde"}]),
        "commercial_quality_assessments": Collection(),
        "commercial_quality_releases": Collection(),
        "commercial_audit_events": Collection(),
    })


@pytest.mark.asyncio
async def test_lab_submission_does_not_release_oil_and_independent_reviewer_can_release():
    db = make_db()
    submitted = await record_oil_quality_assessment(
        db, make_draft(), season_code="2627",
        actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.lab_record"]},
        actor_user_id="lab-tech-1", assessment_id="assessment-1",
        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
    )
    lot = db["commercial_lots"].rows[0]
    assert submitted["status"] == "AWAITING_INDEPENDENT_REVIEW"
    assert "decision" not in submitted
    assert lot["quality_status"] == "PENDING"
    assert lot["version"] == 2

    command = QualityReleaseCommand(
        assessment_id="assessment-1", expected_lot_version=2,
        decision="RELEASED", decision_reason="Reviewed against the cited specification.",
        idempotency_key="quality-release-command-0001",
    )
    released = await release_oil_quality_assessment(
        db, command, season_code="2627",
        actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.quality_release"]},
        actor_user_id="reviewer-2", release_id="release-1",
        created_at=datetime(2026, 11, 2, 1, tzinfo=timezone.utc), session=object(),
    )
    assert released["decision"] == "RELEASED"
    assert lot["quality_status"] == "RELEASED"
    assert lot["version"] == 3
    assert db["commercial_quality_assessments"].rows[0]["reviewed_by"] == "reviewer-2"
    assert len(db["commercial_audit_events"].rows) == 2
    assert submitted["measurements"][0]["value"].to_decimal() == Decimal("0.35")


@pytest.mark.asyncio
async def test_lab_submitter_cannot_release_own_assessment():
    db = make_db()
    await record_oil_quality_assessment(
        db, make_draft(), season_code="2627",
        actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.lab_record"]},
        actor_user_id="same-person", assessment_id="assessment-1",
        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
    )
    command = QualityReleaseCommand(
        assessment_id="assessment-1", expected_lot_version=2,
        decision="RELEASED", decision_reason="Independent review attempted by same actor.",
        idempotency_key="quality-release-same-actor-0001",
    )
    with pytest.raises(PermissionError, match="cannot approve their own"):
        await release_oil_quality_assessment(
            db, command, season_code="2627",
            actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.quality_release"]},
            actor_user_id="same-person", release_id="release-1",
            created_at=datetime(2026, 11, 2, 1, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_lots"].rows[0]["quality_status"] == "PENDING"
    assert db["commercial_quality_releases"].rows == []



@pytest.mark.asyncio
async def test_releasing_preproduction_sample_updates_only_its_latest_source_olive_lot():
    db = make_db()
    sample_lot = db["commercial_lots"].rows[0]
    sample_lot.update({
        "batch_code": "2627A0008",
        "lot_purpose": "PREPRODUCTION_SAMPLE",
        "source_preproduction_sample_id": "trial-1",
        "source_olive_lot_id": "olive-source-1",
    })
    source_lot = {
        "id": "olive-source-1", "product_kind": "OLIVE", "status": "OPEN",
        "batch_code": "2627A0008",
        "preproduction_quality_status": "PENDING",
        "latest_preproduction_sample_id": "trial-1",
    }
    db["commercial_lots"].rows.append(source_lot)
    db["commercial_preproduction_samples"].rows.append({
        "id": "trial-1", "source_olive_lot_id": "olive-source-1",
        "oil_sample_lot_id": "oil-1", "status": "COMPLETED",
    })

    draft = make_draft().model_copy(update={"sample_reference": "2627A0008", "laboratory_name": "Labo Oro Verde"})
    submitted = await record_oil_quality_assessment(
        db, draft, season_code="2627",
        actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.lab_record"]},
        actor_user_id="lab-tech-1", assessment_id="assessment-preproduction-1",
        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
    )
    assert submitted["lot_purpose"] == "PREPRODUCTION_SAMPLE"
    assert submitted["source_olive_lot_id"] == "olive-source-1"
    assert submitted["sample_reference"] == "2627A0008"
    assert submitted["laboratory_name"] == "Labo Oro Verde"

    command = QualityReleaseCommand(
        assessment_id="assessment-preproduction-1", expected_lot_version=2,
        decision="RELEASED", decision_reason="Trial sample meets the approved specification.",
        idempotency_key="quality-preproduction-release-0001",
    )
    await release_oil_quality_assessment(
        db, command, season_code="2627",
        actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.quality_release"]},
        actor_user_id="independent-reviewer", release_id="release-preproduction-1",
        created_at=datetime(2026, 11, 2, 1, tzinfo=timezone.utc), session=object(),
    )
    assert source_lot["preproduction_quality_status"] == "RELEASED"
    assert source_lot["preproduction_sample_id"] == "trial-1"
    assert source_lot["preproduction_quality_assessment_id"] == "assessment-preproduction-1"


@pytest.mark.asyncio
async def test_old_preproduction_sample_cannot_be_submitted_after_a_new_trial_is_created():
    db = make_db()
    sample_lot = db["commercial_lots"].rows[0]
    sample_lot.update({
        "lot_purpose": "PREPRODUCTION_SAMPLE",
        "source_preproduction_sample_id": "trial-old",
        "source_olive_lot_id": "olive-source-1",
    })
    source_lot = {
        "id": "olive-source-1", "product_kind": "OLIVE", "status": "OPEN",
        "batch_code": "2627A0008",
        "preproduction_quality_status": "PENDING",
        "latest_preproduction_sample_id": "trial-new",
    }
    db["commercial_lots"].rows.append(source_lot)
    db["commercial_preproduction_samples"].rows.extend([
        {"id": "trial-old", "source_olive_lot_id": "olive-source-1",
         "oil_sample_lot_id": "oil-1", "status": "COMPLETED"},
        {"id": "trial-new", "source_olive_lot_id": "olive-source-1",
         "oil_sample_lot_id": "oil-new", "status": "COMPLETED"},
    ])
    with pytest.raises(ValueError, match="latest active preproduction sample"):
        await record_oil_quality_assessment(
            db, make_draft(), season_code="2627",
            actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.lab_record"]},
            actor_user_id="lab-tech-1", assessment_id="assessment-old-sample",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_quality_assessments"].rows == []
    assert source_lot["preproduction_quality_status"] == "PENDING"

@pytest.mark.asyncio
async def test_workers_without_scoped_quality_permissions_are_rejected():
    db = make_db()
    with pytest.raises(PermissionError):
        await record_oil_quality_assessment(
            db, make_draft(), season_code="2627",
            actor_user={"active": True, "role": "worker"},
            actor_user_id="worker-1", assessment_id="assessment-1",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_quality_assessments"].rows == []
