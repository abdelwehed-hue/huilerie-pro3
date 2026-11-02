from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from commercial.schemas.quality import QualityAssessmentDraft
from commercial.services.quality import record_oil_quality_assessment


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

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


class Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


def make_draft():
    return QualityAssessmentDraft(
        oil_lot_id="oil-1",
        expected_lot_version=1,
        sample_reference="SAMPLE-001",
        sample_date=date(2026, 11, 2),
        tested_date=date(2026, 11, 2),
        laboratory_name="Accredited Lab",
        specification_reference="SPEC-2026-A",
        measurements=[
            {"code": "ACIDITY", "value": "0.35", "unit": "%"},
            {"code": "PEROXIDE", "value": "8.2", "unit": "meq O2/kg"},
        ],
        decision="RELEASED",
        decision_reason="Reviewed against the cited specification.",
        idempotency_key="quality-service-test-0001",
    )


@pytest.mark.asyncio
async def test_quality_release_updates_oil_lot_and_records_audit():
    db = Database({
        "commercial_lots": Collection([{
            "id": "oil-1", "product_kind": "OIL", "status": "OPEN",
            "quality_status": "PENDING", "version": 1,
        }]),
        "commercial_quality_assessments": Collection(),
        "commercial_audit_events": Collection(),
    })
    result = await record_oil_quality_assessment(
        db, make_draft(), season_code="2627",
        actor_user={"active": True, "role": "admin"},
        actor_user_id="admin-1", assessment_id="assessment-1",
        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
    )
    lot = db["commercial_lots"].rows[0]
    assert result["decision"] == "RELEASED"
    assert lot["quality_status"] == "RELEASED"
    assert lot["version"] == 2
    assert lot["last_quality_assessment_id"] == "assessment-1"
    assert len(db["commercial_audit_events"].rows) == 1
    assert result["measurements"][0]["value"].to_decimal() == Decimal("0.35")


@pytest.mark.asyncio
async def test_quality_rejects_non_oil_lots_and_workers():
    db = Database({
        "commercial_lots": Collection([{
            "id": "olive-1", "product_kind": "OLIVE", "status": "OPEN",
            "quality_status": "PENDING", "version": 1,
        }]),
        "commercial_quality_assessments": Collection(),
        "commercial_audit_events": Collection(),
    })
    with pytest.raises(PermissionError):
        await record_oil_quality_assessment(
            db, make_draft(), season_code="2627",
            actor_user={"active": True, "role": "worker"},
            actor_user_id="worker-1", assessment_id="assessment-2",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    draft = make_draft().model_copy(update={"oil_lot_id": "olive-1"})
    with pytest.raises(ValueError, match="only to oil lots"):
        await record_oil_quality_assessment(
            db, draft, season_code="2627",
            actor_user={"active": True, "role": "admin"},
            actor_user_id="admin-1", assessment_id="assessment-3",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_quality_assessments"].rows == []
