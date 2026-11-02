import os
import uuid
from datetime import date, datetime, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from commercial.inventory_bootstrap import ensure_inventory_indexes
from commercial.schemas.quality import QualityAssessmentDraft, QualityReleaseCommand
from commercial.services.quality import record_oil_quality_assessment, release_oil_quality_assessment


@pytest.mark.asyncio
async def test_lab_submission_and_independent_release_on_replica_set():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client["quality_separation_" + uuid.uuid4().hex]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_lots.insert_one({
            "id": "oil-1", "season_code": "2627", "product_kind": "OIL",
            "status": "OPEN", "quality_status": "PENDING", "version": 1,
        })
        draft = QualityAssessmentDraft(
            oil_lot_id="oil-1", expected_lot_version=1,
            sample_reference="SAMPLE-1", sample_date=date(2026, 11, 1),
            tested_date=date(2026, 11, 2), laboratory_name="Lab",
            specification_reference="SPEC-1",
            measurements=[{"code": "ACIDITY", "value": "0.35", "unit": "%"}],
            idempotency_key="quality-lab-submit-key-001",
        )
        async with await client.start_session() as session:
            assessment = await session.with_transaction(
                lambda active: record_oil_quality_assessment(
                    db, draft, season_code="2627",
                    actor_user={"active": True, "role": "worker",
                                "commercial_permissions": ["commercial.lab_record"]},
                    actor_user_id="lab-worker", assessment_id="assessment-1",
                    created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=active,
                )
            )
        assert assessment["status"] == "AWAITING_INDEPENDENT_REVIEW"
        lot = await db.commercial_lots.find_one({"id": "oil-1"}, {"_id": 0})
        assert lot["quality_status"] == "PENDING"
        assert lot["version"] == 2

        command = QualityReleaseCommand(
            assessment_id="assessment-1", expected_lot_version=2,
            decision="RELEASED", decision_reason="Reviewed against the cited specification.",
            idempotency_key="quality-review-key-0001",
        )
        async with await client.start_session() as session:
            release = await session.with_transaction(
                lambda active: release_oil_quality_assessment(
                    db, command, season_code="2627",
                    actor_user={"active": True, "role": "worker",
                                "commercial_permissions": ["commercial.quality_release"]},
                    actor_user_id="reviewer-worker", release_id="release-1",
                    created_at=datetime(2026, 11, 2, 1, tzinfo=timezone.utc), session=active,
                )
            )
        assert release["decision"] == "RELEASED"
        lot = await db.commercial_lots.find_one({"id": "oil-1"}, {"_id": 0})
        assert lot["quality_status"] == "RELEASED"
        assert lot["version"] == 3
        assessment = await db.commercial_quality_assessments.find_one(
            {"id": "assessment-1"}, {"_id": 0}
        )
        assert assessment["created_by"] == "lab-worker"
        assert assessment["reviewed_by"] == "reviewer-worker"
        assert await db.commercial_quality_releases.count_documents({}) == 1
        assert await db.commercial_audit_events.count_documents({}) == 2
    finally:
        await client.drop_database(db.name)
        client.close()
