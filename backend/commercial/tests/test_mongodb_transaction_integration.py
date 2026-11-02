import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient


@pytest.mark.asyncio
async def test_mongodb_replica_set_supports_atomic_rollback():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "transaction_test_" + uuid.uuid4().hex
    db = client[db_name]
    try:
        with pytest.raises(RuntimeError):
            async with await client.start_session() as session:
                async def operation(active_session):
                    await db.transaction_probe.insert_one({"_id": "written"}, session=active_session)
                    raise RuntimeError("force rollback")
                await session.with_transaction(operation)
        assert await db.transaction_probe.count_documents({}) == 0
    finally:
        await client.drop_database(db_name)
        client.close()

@pytest.mark.asyncio
async def test_concurrent_document_number_reservations_are_unique_and_sequential():
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.services.numbering import reserve_document_number

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "numbering_concurrency_" + uuid.uuid4().hex
    db = client[db_name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627",
            "document_type": "MVT",
            "last_sequence": 0,
        })

        async def reserve_one():
            async with await client.start_session() as session:
                async def operation(active_session):
                    return await reserve_document_number(
                        db.commercial_counters,
                        "2627",
                        "MVT",
                        session=active_session,
                    )
                return await session.with_transaction(operation)

        allocated = await asyncio.gather(*(reserve_one() for _ in range(20)))
        assert len(set(allocated)) == 20
        assert set(allocated) == {
            f"2627MVT{sequence:04d}" for sequence in range(1, 21)
        }
        counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "MVT"},
            {"_id": 0},
        )
        assert counter["last_sequence"] == 20
    finally:
        await client.drop_database(db_name)
        client.close()

@pytest.mark.asyncio
async def test_quality_release_audit_failure_rolls_back_assessment_and_lot_state():
    from datetime import date
    from uuid import NAMESPACE_URL, uuid5

    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.quality import QualityAssessmentDraft
    from commercial.services.quality import record_oil_quality_assessment

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "quality_release_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    assessment_id = "quality-assessment-rollback-1"
    idempotency_key = "quality-release-rollback-key-001"
    lot_id = "oil-lot-quality-rollback"
    audit_id = str(uuid5(
        NAMESPACE_URL,
        f"oroverde:quality-audit:{assessment_id}:{idempotency_key}",
    ))
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_lots.insert_one({
            "id": lot_id,
            "season_code": "2627",
            "product_kind": "OIL",
            "status": "OPEN",
            "quality_status": "PENDING",
            "version": 1,
        })
        # Force the final audit insert to fail after assessment insertion and
        # lot-state update have both executed inside the transaction.
        await db.commercial_audit_events.insert_one({
            "id": audit_id,
            "entity_type": "test_conflict",
            "entity_id": "preexisting",
            "action": "PREEXISTING",
            "actor_user_id": "integration-admin",
            "created_at": datetime(2026, 11, 2, tzinfo=timezone.utc),
            "details": {},
        })
        draft = QualityAssessmentDraft(
            oil_lot_id=lot_id,
            expected_lot_version=1,
            sample_reference="SAMPLE-QA-001",
            sample_date=date(2026, 11, 1),
            tested_date=date(2026, 11, 2),
            laboratory_name="Integration Test Laboratory",
            specification_reference="SPEC-OLIVE-OIL-TEST",
            measurements=[{"code": "ACIDITY", "value": "0.35", "unit": "%"}],
            decision="RELEASED",
            decision_reason="Release decision used only to exercise rollback behavior.",
            idempotency_key=idempotency_key,
        )
        with pytest.raises(DuplicateKeyError):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: record_oil_quality_assessment(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        assessment_id=assessment_id,
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                        session=active,
                    )
                )
        assert await db.commercial_quality_assessments.count_documents({}) == 0
        lot = await db.commercial_lots.find_one({"id": lot_id}, {"_id": 0})
        assert lot["quality_status"] == "PENDING"
        assert lot["version"] == 1
        assert await db.commercial_audit_events.count_documents({}) == 1
    finally:
        await client.drop_database(db_name)
        client.close()
