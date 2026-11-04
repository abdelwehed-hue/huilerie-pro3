import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError


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
async def test_quality_submission_audit_failure_rolls_back_assessment_and_lot_version():
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
        f"oroverde:quality-submission-audit:{assessment_id}:{idempotency_key}",
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

@pytest.mark.asyncio
async def test_purchase_approval_audit_failure_rolls_back_lots_receipts_and_counters():
    from decimal import Decimal
    from uuid import NAMESPACE_URL, uuid5

    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.purchases import ApproveOlivePurchaseCommand
    from commercial.services.purchase_approval import approve_olive_purchase

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "purchase_approval_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    purchase_id = "purchase-rollback-001"
    approval_key = "purchase-approval-rollback-key-001"
    approval_audit_id = str(uuid5(
        NAMESPACE_URL,
        f"oroverde:purchase-approval-audit:{purchase_id}:{approval_key}",
    ))
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "LOT", "last_sequence": 4},
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
        ])
        await db.commercial_locations.insert_one({
            "id": "olive-yard-rollback", "active": True, "kind": "OLIVE_STORAGE"
        })
        await db.commercial_olive_purchases.insert_one({
            "id": purchase_id,
            "season_code": "2627",
            "document_type": "ACH",
            "document_number": "2627ACH0001",
            "supplier_id": "supplier-rollback",
            "lines": [{
                "variety_id": "chemlali",
                "quantity_kg": Decimal128("1250.000"),
                "unit_price_dt": Decimal128("2.500"),
                "line_total_dt": Decimal128("3125.000"),
            }],
            "status": "DRAFT",
            "version": 1,
        })
        # Force the final purchase-approval audit write to fail after the
        # approval, lot creation, receipt movement and balance update.
        await db.commercial_audit_events.insert_one({
            "id": approval_audit_id,
            "entity_type": "test_conflict",
            "entity_id": "preexisting",
            "action": "PREEXISTING",
            "actor_user_id": "integration-admin",
            "created_at": datetime(2026, 11, 2, tzinfo=timezone.utc),
            "details": {},
        })
        command = ApproveOlivePurchaseCommand(
            expected_version=1,
            receiving_location_id="olive-yard-rollback",
            idempotency_key=approval_key,
        )
        with pytest.raises(DuplicateKeyError):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: approve_olive_purchase(
                        db, purchase_id, command,
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                        session=active,
                    )
                )

        purchase = await db.commercial_olive_purchases.find_one(
            {"id": purchase_id}, {"_id": 0}
        )
        assert purchase["status"] == "DRAFT"
        assert purchase["version"] == 1
        assert "lot_ids" not in purchase
        assert await db.commercial_lots.count_documents({}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
        assert await db.commercial_stock_balances.count_documents({}) == 0
        assert await db.commercial_audit_events.count_documents({}) == 1
        lot_counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "LOT"}, {"_id": 0}
        )
        movement_counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "MVT"}, {"_id": 0}
        )
        assert lot_counter["last_sequence"] == 4
        assert movement_counter["last_sequence"] == 0
    finally:
        await client.drop_database(db_name)
        client.close()

@pytest.mark.asyncio
async def test_concurrent_stock_consumption_cannot_overspend_same_balance():
    from decimal import Decimal

    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.inventory import OwnerRef, StockMovementDraft
    from commercial.services.stock_ledger import post_stock_movement

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "stock_overspend_concurrency_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627",
            "document_type": "MVT",
            "last_sequence": 0,
        })
        await db.commercial_locations.insert_one({
            "id": "olive-storage-concurrency",
            "code": "OLIVE-CONC",
            "name": "Concurrency test storage",
            "kind": "OLIVE_STORAGE",
            "active": True,
        })
        await db.commercial_lots.insert_one({
            "id": "olive-lot-concurrency",
            "season_code": "2627",
            "document_type": "LOT",
            "document_number": "2627LOT0001",
            "product_kind": "OLIVE",
            "status": "OPEN",
            "owner": {"kind": "MILL"},
        })
        await db.commercial_olive_purchases.insert_one({
            "id": "approved-purchase-concurrency",
            "season_code": "2627",
            "status": "APPROVED",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OLIVE",
            "lot_id": "olive-lot-concurrency",
            "owner": {"kind": "MILL"},
            "location_id": "olive-storage-concurrency",
            "quantity_kg": Decimal128("100.000"),
            "created_at": now,
        })

        async def consume(key: str):
            draft = StockMovementDraft(
                movement_kind="CONSUMPTION",
                product_kind="OLIVE",
                lot_id="olive-lot-concurrency",
                quantity_kg=Decimal("80.000"),
                source_location_id="olive-storage-concurrency",
                source_owner=OwnerRef(kind="MILL"),
                source_document_type="ACH",
                source_document_id="approved-purchase-concurrency",
                idempotency_key=key,
                reason="Concurrent overspend integration test",
            )
            movement_id = str(uuid.uuid4())
            audit_id = str(uuid.uuid4())

            async with await client.start_session() as session:
                async def operation(active_session):
                    return await post_stock_movement(
                        db, draft,
                        season_code="2627",
                        actor_user_id="integration-admin",
                        actor_user={"active": True, "role": "admin"},
                        movement_id=movement_id,
                        audit_event_id=audit_id,
                        created_at=now,
                        session=active_session,
                    )
                return await session.with_transaction(operation)

        outcomes = await asyncio.gather(
            consume("overspend-attempt-one-0001"),
            consume("overspend-attempt-two-0002"),
            return_exceptions=True,
        )
        successes = [item for item in outcomes if isinstance(item, dict)]
        failures = [item for item in outcomes if isinstance(item, Exception)]
        assert len(successes) == 1, outcomes
        assert len(failures) == 1, outcomes
        assert isinstance(failures[0], ValueError)
        assert "Insufficient stock" in str(failures[0])

        balance = await db.commercial_stock_balances.find_one(
            {"product_kind": "OLIVE", "lot_id": "olive-lot-concurrency",
             "location_id": "olive-storage-concurrency"},
            {"_id": 0},
        )
        assert balance["quantity_kg"].to_decimal() == Decimal("20.000")
        assert await db.commercial_stock_movements.count_documents({}) == 1
        assert await db.commercial_audit_events.count_documents({}) == 1
        counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "MVT"}, {"_id": 0}
        )
        assert counter["last_sequence"] == 1
    finally:
        await client.drop_database(db_name)
        client.close()

@pytest.mark.asyncio
async def test_internal_transfer_document_and_ledger_post_atomically():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.internal_movements import InternalMovementDraft
    from commercial.services.internal_movements import create_internal_movement

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "internal_transfer_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "INT", "last_sequence": 0},
        ])
        await db.commercial_locations.insert_many([
            {"id": "storage-a", "code": "STORAGE-A", "active": True, "kind": "OLIVE_STORAGE"},
            {"id": "storage-b", "code": "STORAGE-B", "active": True, "kind": "STAGING"},
        ])
        await db.commercial_lots.insert_one({
            "id": "olive-lot-transfer", "product_kind": "OLIVE", "status": "OPEN",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OLIVE", "lot_id": "olive-lot-transfer",
            "owner": {"kind": "MILL"}, "location_id": "storage-a",
            "quantity_kg": Decimal128("100.000"), "created_at": now,
        })
        draft = InternalMovementDraft(
            movement_kind="TRANSFER", product_kind="OLIVE",
            lot_id="olive-lot-transfer", quantity_kg=Decimal("25.000"),
            source_location_id="storage-a", destination_location_id="storage-b",
            source_owner={"kind": "MILL"}, destination_owner={"kind": "MILL"},
            idempotency_key="internal-transfer-test-key-001",
            reason="Move olives to staging",
        )
        async with await client.start_session() as session:
            result = await session.with_transaction(
                lambda active: create_internal_movement(
                    db, draft, season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    movement_document_id="internal-doc-1",
                    stock_movement_id="stock-movement-1",
                    audit_event_id="internal-audit-1",
                    created_at=now, session=active,
                )
            )
        assert result["status"] == "APPROVED"
        assert result["document_number"] == "2627INT0001"
        assert result["stock_movement_id"] == "stock-movement-1"
        int_counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "INT"}, {"_id": 0}
        )
        assert int_counter["last_sequence"] == 1
        source = await db.commercial_stock_balances.find_one({"location_id": "storage-a"})
        destination = await db.commercial_stock_balances.find_one({"location_id": "storage-b"})
        assert source["quantity_kg"].to_decimal() == Decimal("75.000")
        assert destination["quantity_kg"].to_decimal() == Decimal("25.000")
        movement = await db.commercial_stock_movements.find_one({"id": "stock-movement-1"})
        assert movement["source_document_type"] == "INT"
        assert movement["source_document_id"] == "internal-doc-1"
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_partial_ownership_transfer_splits_one_lot_between_mill_and_customer():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.internal_movements import InternalMovementDraft
    from commercial.services.internal_movements import create_internal_movement

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "internal_ownership_transfer_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "INT", "last_sequence": 0},
        ])
        await db.commercial_locations.insert_one({
            "id": "storage-a", "code": "STORAGE-A", "active": True, "kind": "OLIVE_STORAGE",
        })
        await db.commercial_custody_owners.insert_one({
            "id": "custody-owner-a", "legacy_client_id": "legacy-a",
            "client_phone": "21611111111", "client_name": "Customer A", "active": True,
        })
        await db.commercial_lots.insert_one({
            "id": "olive-lot-split", "season_code": "2627",
            "document_number": "2627LOT0001", "product_kind": "OLIVE",
            "owner": {"kind": "MILL"}, "status": "OPEN",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OLIVE", "lot_id": "olive-lot-split",
            "owner": {"kind": "MILL"}, "location_id": "storage-a",
            "quantity_kg": Decimal128("100.000"), "created_at": now,
        })
        draft = InternalMovementDraft(
            movement_kind="OWNERSHIP_TRANSFER", product_kind="OLIVE",
            lot_id="olive-lot-split", quantity_kg=Decimal("35.000"),
            source_location_id="storage-a", destination_location_id="storage-a",
            source_owner={"kind": "MILL"},
            destination_owner={"kind": "CUSTOMER", "customer_id": "custody-owner-a"},
            idempotency_key="partial-ownership-transfer-key-001",
            reason="Transfer part of this lot to customer custody",
        )
        async with await client.start_session() as session:
            result = await session.with_transaction(
                lambda active: create_internal_movement(
                    db, draft, season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    movement_document_id="internal-ownership-doc-1",
                    stock_movement_id="stock-ownership-movement-1",
                    audit_event_id="internal-ownership-audit-1",
                    created_at=now, session=active,
                )
            )
        assert result["document_number"] == "2627INT0001"
        mill_balance = await db.commercial_stock_balances.find_one({
            "product_kind": "OLIVE", "lot_id": "olive-lot-split",
            "owner.kind": "MILL", "location_id": "storage-a",
        })
        customer_balance = await db.commercial_stock_balances.find_one({
            "product_kind": "OLIVE", "lot_id": "olive-lot-split",
            "owner.kind": "CUSTOMER", "owner.customer_id": "custody-owner-a",
            "location_id": "storage-a",
        })
        assert mill_balance["quantity_kg"].to_decimal() == Decimal("65.000")
        assert customer_balance["quantity_kg"].to_decimal() == Decimal("35.000")
        assert (
            mill_balance["quantity_kg"].to_decimal()
            + customer_balance["quantity_kg"].to_decimal()
        ) == Decimal("100.000")
        movement = await db.commercial_stock_movements.find_one(
            {"id": "stock-ownership-movement-1"}, {"_id": 0}
        )
        assert movement["movement_kind"] == "OWNERSHIP_TRANSFER"
        assert movement["source_owner"] == {"kind": "MILL"}
        assert movement["destination_owner"] == {
            "kind": "CUSTOMER", "customer_id": "custody-owner-a"
        }
    finally:
        await client.drop_database(db_name)
        client.close()


async def test_internal_movement_audit_failure_rolls_back_document_and_balances():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from pymongo.errors import DuplicateKeyError
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.internal_movements import InternalMovementDraft
    from commercial.services.internal_movements import create_internal_movement

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "internal_transfer_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "INT", "last_sequence": 0},
        ])
        await db.commercial_locations.insert_many([
            {"id": "storage-a", "code": "STORAGE-A", "active": True, "kind": "OLIVE_STORAGE"},
            {"id": "storage-b", "code": "STORAGE-B", "active": True, "kind": "STAGING"},
        ])
        await db.commercial_lots.insert_one({
            "id": "olive-lot-transfer", "product_kind": "OLIVE", "status": "OPEN",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OLIVE", "lot_id": "olive-lot-transfer",
            "owner": {"kind": "MILL"}, "location_id": "storage-a",
            "quantity_kg": Decimal128("100.000"), "created_at": now,
        })
        await db.commercial_audit_events.insert_one({
            "id": "internal-audit-conflict", "entity_type": "test",
            "entity_id": "existing", "action": "EXISTING",
            "actor_user_id": "integration-admin", "created_at": now, "details": {},
        })
        draft = InternalMovementDraft(
            movement_kind="TRANSFER", product_kind="OLIVE",
            lot_id="olive-lot-transfer", quantity_kg=Decimal("25.000"),
            source_location_id="storage-a", destination_location_id="storage-b",
            source_owner={"kind": "MILL"}, destination_owner={"kind": "MILL"},
            idempotency_key="internal-transfer-rollback-key-001",
            reason="Move olives to staging",
        )
        with pytest.raises(DuplicateKeyError):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: create_internal_movement(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        movement_document_id="internal-doc-rollback",
                        stock_movement_id="stock-movement-rollback",
                        audit_event_id="internal-audit-conflict",
                        created_at=now, session=active,
                    )
                )
        assert await db.commercial_internal_movements.count_documents({}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
        source = await db.commercial_stock_balances.find_one({"location_id": "storage-a"})
        assert source["quantity_kg"].to_decimal() == Decimal("100.000")
        assert await db.commercial_stock_balances.count_documents({"location_id": "storage-b"}) == 0
        counter = await db.commercial_counters.find_one({"document_type": "MVT"})
        assert counter["last_sequence"] == 0
        int_counter = await db.commercial_counters.find_one({"document_type": "INT"})
        assert int_counter["last_sequence"] == 0
    finally:
        await client.drop_database(db_name)
        client.close()



@pytest.mark.asyncio
async def test_wholesale_sale_dispatches_only_released_mill_owned_oil_and_tracks_payments():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.sales import (
        ApproveWholesaleSaleCommand, SalePaymentDraft, WholesaleSaleDraft,
    )
    from commercial.services.sales import (
        create_wholesale_sale_draft, approve_wholesale_sale, record_sale_payment,
    )

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "wholesale_sale_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("VTE", "FAC", "MVT", "PAY")
        ])
        await db.commercial_buyers.insert_one({
            "id": "buyer-1", "name": "Wholesale Buyer", "active": True,
        })
        await db.commercial_tanks.insert_one({
            "id": "tank-01", "code": "T01", "active": True,
        })
        await db.commercial_lots.insert_one({
            "id": "oil-lot-sale", "season_code": "2627", "document_type": "LOT",
            "document_number": "2627LOT0001", "product_kind": "OIL",
            "status": "OPEN", "owner": {"kind": "MILL"},
            "quality_status": "RELEASED", "quality_decision_id": "quality-release-1",
        })
        await db.commercial_quality_releases.insert_one({
            "id": "quality-release-1", "oil_lot_id": "oil-lot-sale", "decision": "RELEASED",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "oil-lot-sale",
            "owner": {"kind": "MILL"}, "location_id": "tank-01",
            "quantity_kg": Decimal128("100.000"), "created_at": now,
        })
        sale_draft = WholesaleSaleDraft(
            sale_date="2026-11-02", buyer_id="buyer-1", oil_lot_id="oil-lot-sale",
            source_tank_id="tank-01", quantity_kg="25.000", unit_price_dt="4.500",
            idempotency_key="wholesale-sale-create-key-001",
        )
        async with await client.start_session() as session:
            sale = await session.with_transaction(
                lambda active: create_wholesale_sale_draft(
                    db, sale_draft, season_code="2627", actor_user=admin,
                    actor_user_id="admin-1", sale_id="sale-1",
                    audit_event_id="sale-draft-audit-1", created_at=now, session=active,
                )
            )
        assert sale["document_number"] == "2627VTE0001"
        command = ApproveWholesaleSaleCommand(
            expected_version=1, idempotency_key="wholesale-sale-approve-key-001"
        )
        async with await client.start_session() as session:
            approved = await session.with_transaction(
                lambda active: approve_wholesale_sale(
                    db, "sale-1", command, season_code="2627",
                    actor_user=admin, actor_user_id="admin-1",
                    invoice_id="invoice-1", stock_movement_id="dispatch-1",
                    audit_event_id="sale-approval-audit-1", created_at=now, session=active,
                )
            )
        assert approved["status"] == "APPROVED"
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-1"})
        assert invoice["document_number"] == "2627FAC0001"
        assert invoice["total_amount_dt"].to_decimal() == Decimal("112.500")
        assert invoice["tax_treatment_status"] == "NOT_CONFIGURED"
        balance = await db.commercial_stock_balances.find_one({"location_id": "tank-01"})
        assert balance["quantity_kg"].to_decimal() == Decimal("75.000")
        movement = await db.commercial_stock_movements.find_one({"id": "dispatch-1"})
        assert movement["source_document_type"] == "VTE"

        first_payment = SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="50.000", method="CASH",
            expected_invoice_version=1, idempotency_key="sale-payment-key-0001",
        )
        # A stale/corrupt receivable snapshot must not be trusted when posting new cash.
        await db.commercial_sales_invoices.update_one(
            {"id": "invoice-1"},
            {"$set": {"outstanding_amount_dt": Decimal128("112.499")}},
        )
        with pytest.raises(ValueError, match="receivable fields are inconsistent"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: record_sale_payment(
                        db, "invoice-1", first_payment, season_code="2627",
                        actor_user=admin, actor_user_id="admin-1",
                        payment_id="payment-corrupt", audit_event_id="payment-corrupt-audit",
                        created_at=now, session=active,
                    )
                )
        assert await db.commercial_sale_payments.count_documents({"invoice_id": "invoice-1"}) == 0
        await db.commercial_sales_invoices.update_one(
            {"id": "invoice-1"},
            {"$set": {"outstanding_amount_dt": Decimal128("112.500")}},
        )
        async with await client.start_session() as session:
            payment = await session.with_transaction(
                lambda active: record_sale_payment(
                    db, "invoice-1", first_payment, season_code="2627",
                    actor_user=admin, actor_user_id="admin-1",
                    payment_id="payment-1", audit_event_id="payment-audit-1",
                    created_at=now, session=active,
                )
            )
        assert payment["document_number"] == "2627PAY0001"
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-1"})
        assert invoice["payment_status"] == "PARTIALLY_PAID"
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("62.500")

        overpayment = SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="62.501", method="CASH",
            expected_invoice_version=2, idempotency_key="sale-payment-overpay-key-001",
        )
        with pytest.raises(ValueError, match="exceeds the outstanding"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: record_sale_payment(
                        db, "invoice-1", overpayment, season_code="2627",
                        actor_user=admin, actor_user_id="admin-1",
                        payment_id="payment-overpay", audit_event_id="payment-overpay-audit",
                        created_at=now, session=active,
                    )
                )
        assert await db.commercial_sale_payments.count_documents({"invoice_id": "invoice-1"}) == 1
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-1"})
        assert invoice["version"] == 2
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("62.500")

        second_payment = SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="62.500", method="BANK_TRANSFER", reference="BANK-TRX-002",
            expected_invoice_version=2, idempotency_key="sale-payment-key-0002",
        )
        async with await client.start_session() as session:
            await session.with_transaction(
                lambda active: record_sale_payment(
                    db, "invoice-1", second_payment, season_code="2627",
                    actor_user=admin, actor_user_id="admin-1",
                    payment_id="payment-2", audit_event_id="payment-audit-2",
                    created_at=now, session=active,
                )
            )
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-1"})
        assert invoice["payment_status"] == "PAID"
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("0.000")
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_wholesale_sale_rejects_customer_custody_and_unreleased_oil():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.sales import ApproveWholesaleSaleCommand, WholesaleSaleDraft
    from commercial.services.sales import create_wholesale_sale_draft, approve_wholesale_sale

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "wholesale_sale_blocked_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("VTE", "FAC", "MVT")
        ])
        await db.commercial_buyers.insert_one({
            "id": "buyer-1", "name": "Wholesale Buyer", "active": True,
        })
        await db.commercial_tanks.insert_one({"id": "tank-01", "code": "T01", "active": True})
        await db.commercial_lots.insert_one({
            "id": "oil-lot-custody", "product_kind": "OIL", "status": "OPEN",
            "owner": {"kind": "CUSTOMER", "customer_id": "client-1"},
            "quality_status": "RELEASED", "quality_decision_id": "release-custody",
        })
        await db.commercial_quality_releases.insert_one({
            "id": "release-custody", "oil_lot_id": "oil-lot-custody", "decision": "RELEASED",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "oil-lot-custody",
            "owner": {"kind": "CUSTOMER", "customer_id": "client-1"},
            "location_id": "tank-01", "quantity_kg": Decimal128("40.000"),
            "created_at": now,
        })
        draft = WholesaleSaleDraft(
            sale_date="2026-11-02", buyer_id="buyer-1", oil_lot_id="oil-lot-custody",
            source_tank_id="tank-01", quantity_kg=Decimal("10.000"),
            unit_price_dt=Decimal("5.000"), idempotency_key="blocked-sale-create-key-001",
        )
        async with await client.start_session() as session:
            await session.with_transaction(
                lambda active: create_wholesale_sale_draft(
                    db, draft, season_code="2627", actor_user=admin,
                    actor_user_id="admin-1", sale_id="sale-blocked",
                    audit_event_id="sale-blocked-draft-audit", created_at=now, session=active,
                )
            )
        with pytest.raises(ValueError, match="Insufficient stock"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: approve_wholesale_sale(
                        db, "sale-blocked",
                        ApproveWholesaleSaleCommand(
                            expected_version=1, idempotency_key="blocked-sale-approve-key-001"
                        ),
                        season_code="2627", actor_user=admin, actor_user_id="admin-1",
                        invoice_id="blocked-invoice", stock_movement_id="blocked-dispatch",
                        audit_event_id="blocked-approval-audit", created_at=now, session=active,
                    )
                )
        sale = await db.commercial_sales.find_one({"id": "sale-blocked"})
        assert sale["status"] == "DRAFT"
        assert await db.commercial_sales_invoices.count_documents({}) == 0
        balance = await db.commercial_stock_balances.find_one({"location_id": "tank-01"})
        assert balance["quantity_kg"].to_decimal() == Decimal("40.000")

        # A mill-owned oil lot is still unsellable until an explicit quality release exists.
        await db.commercial_lots.insert_one({
            "id": "oil-lot-pending", "season_code": "2627", "document_type": "LOT",
            "document_number": "2627LOT0002", "product_kind": "OIL", "status": "OPEN",
            "owner": {"kind": "MILL"}, "quality_status": "PENDING",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "oil-lot-pending",
            "owner": {"kind": "MILL"}, "location_id": "tank-01",
            "quantity_kg": Decimal128("30.000"), "created_at": now,
        })
        pending_draft = WholesaleSaleDraft(
            sale_date="2026-11-02", buyer_id="buyer-1", oil_lot_id="oil-lot-pending",
            source_tank_id="tank-01", quantity_kg=Decimal("5.000"),
            unit_price_dt=Decimal("5.000"), idempotency_key="pending-sale-create-key-001",
        )
        async with await client.start_session() as session:
            await session.with_transaction(
                lambda active: create_wholesale_sale_draft(
                    db, pending_draft, season_code="2627", actor_user=admin,
                    actor_user_id="admin-1", sale_id="sale-pending",
                    audit_event_id="sale-pending-draft-audit", created_at=now, session=active,
                )
            )
        with pytest.raises(ValueError, match="not been released"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: approve_wholesale_sale(
                        db, "sale-pending",
                        ApproveWholesaleSaleCommand(
                            expected_version=1, idempotency_key="pending-sale-approve-key-001"
                        ),
                        season_code="2627", actor_user=admin, actor_user_id="admin-1",
                        invoice_id="pending-invoice", stock_movement_id="pending-dispatch",
                        audit_event_id="pending-approval-audit", created_at=now, session=active,
                    )
                )
        pending_sale = await db.commercial_sales.find_one({"id": "sale-pending"})
        assert pending_sale["status"] == "DRAFT"
        assert await db.commercial_sales_invoices.count_documents({"sale_id": "sale-pending"}) == 0
    finally:
        await client.drop_database(db_name)
        client.close()



@pytest.mark.asyncio
async def test_wholesale_sale_approval_audit_failure_rolls_back_invoice_dispatch_and_counters():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from pymongo.errors import DuplicateKeyError
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.sales import ApproveWholesaleSaleCommand, WholesaleSaleDraft
    from commercial.services.sales import create_wholesale_sale_draft, approve_wholesale_sale

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "wholesale_sale_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    sale_id = "sale-rollback"
    approval_key = "sale-approval-rollback-key-001"
    approval_audit_id = "sale-approval-audit-conflict"
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("VTE", "FAC", "MVT")
        ])
        await db.commercial_buyers.insert_one({
            "id": "buyer-rollback", "name": "Rollback Buyer", "active": True,
        })
        await db.commercial_tanks.insert_one({
            "id": "tank-rollback", "code": "TRB", "active": True,
        })
        await db.commercial_lots.insert_one({
            "id": "oil-lot-rollback", "season_code": "2627",
            "document_type": "LOT", "document_number": "2627LOT0099",
            "product_kind": "OIL", "status": "OPEN", "owner": {"kind": "CUSTOMER", "customer_id": "previous-owner"},
            "quality_status": "RELEASED", "quality_decision_id": "release-rollback",
        })
        await db.commercial_quality_releases.insert_one({
            "id": "release-rollback", "oil_lot_id": "oil-lot-rollback",
            "decision": "RELEASED",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "oil-lot-rollback",
            "owner": {"kind": "MILL"}, "location_id": "tank-rollback",
            "quantity_kg": Decimal128("50.000"), "created_at": now,
        })
        draft = WholesaleSaleDraft(
            sale_date="2026-11-02", buyer_id="buyer-rollback",
            oil_lot_id="oil-lot-rollback", source_tank_id="tank-rollback",
            quantity_kg=Decimal("12.000"), unit_price_dt=Decimal("5.000"),
            idempotency_key="sale-rollback-create-key-001",
        )
        async with await client.start_session() as session:
            await session.with_transaction(
                lambda active: create_wholesale_sale_draft(
                    db, draft, season_code="2627", actor_user=admin,
                    actor_user_id="admin-1", sale_id=sale_id,
                    audit_event_id="sale-rollback-draft-audit",
                    created_at=now, session=active,
                )
            )
        # Fail the final approval audit write after the invoice and dispatch
        # have been created inside the transaction.
        await db.commercial_audit_events.insert_one({
            "id": approval_audit_id, "entity_type": "test",
            "entity_id": "preexisting", "action": "EXISTING",
            "actor_user_id": "admin-1", "created_at": now, "details": {},
        })
        command = ApproveWholesaleSaleCommand(
            expected_version=1, idempotency_key=approval_key,
        )
        with pytest.raises(DuplicateKeyError):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: approve_wholesale_sale(
                        db, sale_id, command, season_code="2627",
                        actor_user=admin, actor_user_id="admin-1",
                        invoice_id="invoice-rollback", stock_movement_id="dispatch-rollback",
                        audit_event_id=approval_audit_id, created_at=now, session=active,
                    )
                )
        sale = await db.commercial_sales.find_one({"id": sale_id})
        assert sale["status"] == "DRAFT"
        assert sale["version"] == 1
        assert await db.commercial_sales_invoices.count_documents({}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
        balance = await db.commercial_stock_balances.find_one({"location_id": "tank-rollback"})
        assert balance["quantity_kg"].to_decimal() == Decimal("50.000")
        assert await db.commercial_audit_events.count_documents({}) == 2
        for kind in ("FAC", "MVT"):
            counter = await db.commercial_counters.find_one({
                "season_code": "2627", "document_type": kind,
            })
            assert counter["last_sequence"] == 0
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_buyer_account_summary_aggregates_invoices_and_keeps_inactive_buyer_history(monkeypatch):
    from bson.decimal128 import Decimal128
    from commercial import routers

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "buyer_account_summary_" + uuid.uuid4().hex
    test_db = client[db_name]
    monkeypatch.setattr(routers, "db", test_db)
    monkeypatch.setattr(routers, "_authorize", lambda user, permission: None)
    try:
        await test_db.commercial_buyers.insert_one({
            "id": "buyer-summary-1", "name": "Historical Buyer", "active": False, "credit_balance_dt": Decimal128("12.500"),
        })
        await test_db.commercial_sales_invoices.insert_many([
            {
                "id": "invoice-summary-1", "buyer_id": "buyer-summary-1",
                "total_amount_dt": Decimal128("100.000"),
                "paid_amount_dt": Decimal128("25.000"),
                "outstanding_amount_dt": Decimal128("65.000"),
                "net_amount_dt": Decimal128("90.000"),
                "credited_amount_dt": Decimal128("10.000"),
                "payment_status": "PARTIALLY_PAID",
            },
            {
                "id": "invoice-summary-2", "buyer_id": "buyer-summary-1",
                "total_amount_dt": Decimal128("50.500"),
                "paid_amount_dt": Decimal128("50.500"),
                "outstanding_amount_dt": Decimal128("0.000"),
                "payment_status": "PAID",
            },
        ])
        result = await routers.get_commercial_buyer_account_summary(
            "buyer-summary-1", {"id": "reader-1"}
        )
        assert result["buyer"]["active"] is False
        assert result["summary"]["invoice_count"] == 2
        assert result["summary"]["gross_invoiced_amount_dt"] == "150.500"
        assert result["summary"]["total_amount_dt"] == "140.500"
        assert result["summary"]["credited_amount_dt"] == "10.000"
        assert result["summary"]["paid_amount_dt"] == "75.500"
        assert result["summary"]["outstanding_amount_dt"] == "65.000"
        assert result["summary"]["buyer_credit_balance_dt"] == "12.500"
        assert result["summary"]["unpaid_invoice_count"] == 0
        assert result["summary"]["partially_paid_invoice_count"] == 1
        assert result["summary"]["paid_invoice_count"] == 1

        await test_db.commercial_buyers.insert_one({
            "id": "buyer-summary-empty", "name": "New Buyer", "active": True,
        })
        empty = await routers.get_commercial_buyer_account_summary(
            "buyer-summary-empty", {"id": "reader-1"}
        )
        assert empty["summary"]["invoice_count"] == 0
        assert empty["summary"]["total_amount_dt"] == "0.000"
        assert empty["summary"]["outstanding_amount_dt"] == "0.000"
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_buyer_profile_lifecycle_is_versioned_and_audited(monkeypatch):
    from fastapi import HTTPException
    from commercial import routers
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.buyers import CommercialBuyerUpdate, CommercialBuyerStatusCommand

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "buyer_lifecycle_" + uuid.uuid4().hex
    test_db = client[db_name]
    monkeypatch.setattr(routers, "db", test_db)
    monkeypatch.setattr(routers, "_authorize", lambda user, permission: None)

    async def run_test_transaction(operation):
        async with await client.start_session() as session:
            return await session.with_transaction(operation)

    monkeypatch.setattr(routers, "run_transaction", run_test_transaction)

    async def ready():
        return {"active_season": "2627"}, "2627"

    monkeypatch.setattr(routers, "_require_commercial_ready", ready)
    admin = {"id": "buyer-admin", "role": "admin", "active": True}
    try:
        await ensure_inventory_indexes(test_db)
        await test_db.commercial_buyers.insert_one({
            "id": "buyer-lifecycle-1", "name": "Buyer One",
            "normalized_name": "buyer one", "active": True, "version": 1,
        })
        updated = await routers.update_commercial_buyer(
            "buyer-lifecycle-1",
            CommercialBuyerUpdate(
                expected_version=1, name="Buyer One Updated",
                contact_name="Purchasing", phone="12345",
                email=None, tax_identifier=None, address=None,
            ),
            admin,
        )
        assert updated["name"] == "Buyer One Updated"
        assert updated["version"] == 2

        with pytest.raises(HTTPException) as stale:
            await routers.update_commercial_buyer(
                "buyer-lifecycle-1",
                CommercialBuyerUpdate(
                    expected_version=1, name="Stale Name",
                    contact_name=None, phone=None, email=None,
                    tax_identifier=None, address=None,
                ),
                admin,
            )
        assert stale.value.status_code == 409

        inactive = await routers.set_commercial_buyer_status(
            "buyer-lifecycle-1",
            CommercialBuyerStatusCommand(expected_version=2, active=False),
            admin,
        )
        assert inactive["active"] is False
        assert inactive["version"] == 3

        reactivated = await routers.set_commercial_buyer_status(
            "buyer-lifecycle-1",
            CommercialBuyerStatusCommand(expected_version=3, active=True),
            admin,
        )
        assert reactivated["active"] is True
        assert reactivated["version"] == 4

        events = await test_db.commercial_audit_events.find(
            {"entity_id": "buyer-lifecycle-1"}, {"_id": 0}
        ).to_list(10)
        assert [event["action"] for event in events] == [
            "BUYER_UPDATED", "BUYER_DEACTIVATED", "BUYER_REACTIVATED"
        ]
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_draft_sale_cancellation_is_atomic_and_never_reverses_approved_sale():
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.sales import CancelWholesaleSaleCommand
    from commercial.services.sales import cancel_wholesale_sale_draft

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "sale_cancel_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_sales.insert_many([
            {
                "id": "sale-draft-cancel", "document_number": "2627VTE0001",
                "status": "DRAFT", "version": 1,
                "idempotency_scope": "test:admin", "idempotency_key": "sale-draft-create-key",
            },
            {
                "id": "sale-approved-protected", "document_number": "2627VTE0002",
                "status": "APPROVED", "version": 2,
                "idempotency_scope": "test:admin", "idempotency_key": "sale-approved-create-key",
            },
        ])
        command = CancelWholesaleSaleCommand(
            expected_version=1, reason="Buyer withdrew the order",
            idempotency_key="cancel-draft-sale-key-001",
        )
        async with await client.start_session() as session:
            cancelled = await session.with_transaction(
                lambda active: cancel_wholesale_sale_draft(
                    db, "sale-draft-cancel", command, actor_user=admin,
                    actor_user_id="admin-1", audit_event_id="sale-cancel-audit-1",
                    created_at=now, session=active,
                )
            )
        assert cancelled["status"] == "CANCELLED"
        assert cancelled["version"] == 2
        assert cancelled["cancellation_reason"] == "Buyer withdrew the order"

        # Same request is idempotent; a different request cannot rewrite history.
        async with await client.start_session() as session:
            repeated = await session.with_transaction(
                lambda active: cancel_wholesale_sale_draft(
                    db, "sale-draft-cancel", command, actor_user=admin,
                    actor_user_id="admin-1", audit_event_id="ignored-audit",
                    created_at=now, session=active,
                )
            )
        assert repeated["status"] == "CANCELLED"
        assert await db.commercial_audit_events.count_documents(
            {"entity_id": "sale-draft-cancel", "action": "SALE_DRAFT_CANCELLED"}
        ) == 1

        approved_command = CancelWholesaleSaleCommand(
            expected_version=2, reason="Attempt to cancel posted sale",
            idempotency_key="cancel-approved-sale-key-001",
        )
        with pytest.raises(ValueError, match="Only a draft"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: cancel_wholesale_sale_draft(
                        db, "sale-approved-protected", approved_command,
                        actor_user=admin, actor_user_id="admin-1",
                        audit_event_id="must-not-exist", created_at=now, session=active,
                    )
                )
        protected = await db.commercial_sales.find_one({"id": "sale-approved-protected"})
        assert protected["status"] == "APPROVED"
        assert protected["version"] == 2
        assert await db.commercial_sales_invoices.count_documents(
            {"sale_id": "sale-approved-protected"}
        ) == 0
        assert await db.commercial_stock_movements.count_documents(
            {"source_document_id": "sale-approved-protected"}
        ) == 0
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_sale_return_receipt_is_atomic_idempotent_and_quarantined():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.returns import SaleReturnDraft
    from commercial.services.sale_returns import receive_wholesale_sale_return

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "sale_return_quarantine_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "RET", "last_sequence": 0},
            {"season_code": "2627", "document_type": "LOT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
        ])
        await db.commercial_tanks.insert_one({
            "id": "tank-quarantine-1", "code": "T09", "active": True,
            "role": "QUARANTINE", "version": 2,
        })
        await db.commercial_lots.insert_one({
            "id": "original-oil-lot", "product_kind": "OIL",
            "owner": {"kind": "MILL"}, "status": "OPEN",
            "quality_status": "RELEASED",
        })
        await db.commercial_sales.insert_one({
            "id": "sale-return-source", "status": "APPROVED", "version": 2,
            "invoice_id": "invoice-return-source", "buyer_id": "buyer-return",
            "oil_lot_id": "original-oil-lot", "quantity_kg": Decimal128("100.000"),
            "unit_price_dt": Decimal128("5.000"), "total_amount_dt": Decimal128("500.000"),
            "returned_quantity_kg": Decimal128("0.000"),
            "idempotency_scope": "test:sale", "idempotency_key": "sale-source-idempotency",
        })
        await db.commercial_sales_invoices.insert_one({
            "id": "invoice-return-source", "sale_id": "sale-return-source",
            "buyer_id": "buyer-return", "total_amount_dt": Decimal128("500.000"),
            "paid_amount_dt": Decimal128("0.000"), "outstanding_amount_dt": Decimal128("500.000"),
            "payment_status": "UNPAID",
        })
        draft = SaleReturnDraft(
            expected_sale_version=2, quantity_kg=Decimal("30.000"),
            quarantine_tank_id="tank-quarantine-1",
            reason="Buyer returned sealed containers",
            buyer_acknowledgement_reference="ACK-RET-001",
            idempotency_key="sale-return-idempotency-001",
        )

        async def receive(active_session, return_id="return-1", lot_id="returned-lot-1"):
            return await receive_wholesale_sale_return(
                db, "sale-return-source", draft, season_code="2627",
                actor_user=admin, actor_user_id="return-admin",
                return_id=return_id, returned_lot_id=lot_id,
                stock_movement_id="return-stock-movement-1",
                audit_event_id="return-audit-1", created_at=now, session=active_session,
            )

        async with await client.start_session() as session:
            result = await session.with_transaction(receive)
        assert result["document_number"] == "2627RET0001"
        assert result["status"] == "RECEIVED"
        assert result["commercial_acceptance_status"] == "PENDING"
        assert result["quality_status"] == "PENDING"

        sale = await db.commercial_sales.find_one({"id": "sale-return-source"})
        assert sale["returned_quantity_kg"].to_decimal() == Decimal("30.000")
        assert sale["version"] == 3
        returned_lot = await db.commercial_lots.find_one({"id": "returned-lot-1"})
        assert returned_lot["quality_status"] == "PENDING"
        balance = await db.commercial_stock_balances.find_one({
            "lot_id": "returned-lot-1", "location_id": "tank-quarantine-1",
        })
        assert balance["quantity_kg"].to_decimal() == Decimal("30.000")
        movement = await db.commercial_stock_movements.find_one({
            "source_document_type": "RET", "source_document_id": "return-1",
        })
        assert movement["movement_kind"] == "RECEIPT"
        assert movement["destination_location_id"] == "tank-quarantine-1"

        async with await client.start_session() as session:
            repeated = await session.with_transaction(receive)
        assert repeated["id"] == "return-1"
        assert await db.commercial_sale_returns.count_documents({}) == 1
        assert await db.commercial_stock_movements.count_documents({
            "source_document_type": "RET",
        }) == 1

        excessive = SaleReturnDraft(
            expected_sale_version=3, quantity_kg=Decimal("70.001"),
            quarantine_tank_id="tank-quarantine-1", reason="Exceeds remaining sold quantity",
            idempotency_key="sale-return-idempotency-002",
        )
        with pytest.raises(ValueError, match="exceeds the remaining dispatched quantity"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: receive_wholesale_sale_return(
                        db, "sale-return-source", excessive, season_code="2627",
                        actor_user=admin, actor_user_id="return-admin",
                        return_id="return-2", returned_lot_id="returned-lot-2",
                        stock_movement_id="return-stock-movement-2",
                        audit_event_id="return-audit-2", created_at=now, session=active,
                    )
                )
        assert await db.commercial_sale_returns.count_documents({}) == 1
        assert await db.commercial_lots.count_documents({"source_sale_return_id": "return-2"}) == 0
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_return_acceptance_issues_credit_note_and_tracks_buyer_credit_without_refund():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.return_acceptance import AcceptSaleReturnCommand
    from commercial.services.return_acceptance import accept_sale_return_and_issue_credit_note

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "sale_return_credit_note_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "AVO", "last_sequence": 0,
        })
        await db.commercial_buyers.insert_many([
            {"id": "buyer-credit-paid", "name": "Paid Buyer", "normalized_name": "paid buyer",
             "active": True, "version": 1, "credit_balance_dt": Decimal128("0.000")},
            {"id": "buyer-credit-partial", "name": "Partial Buyer", "normalized_name": "partial buyer",
             "active": True, "version": 1, "credit_balance_dt": Decimal128("0.000")},
        ])
        await db.commercial_sales.insert_many([
            {"id": "sale-credit-paid", "season_code": "2627", "document_number": "2627VTE0001",
             "status": "APPROVED", "buyer_id": "buyer-credit-paid",
             "unit_price_dt": Decimal128("5.000"), "idempotency_scope": "test:credit",
             "idempotency_key": "sale-credit-paid-key"},
            {"id": "sale-credit-partial", "season_code": "2627", "document_number": "2627VTE0002",
             "status": "APPROVED", "buyer_id": "buyer-credit-partial",
             "unit_price_dt": Decimal128("5.000"), "idempotency_scope": "test:credit",
             "idempotency_key": "sale-credit-partial-key"},
        ])
        await db.commercial_sales_invoices.insert_many([
            {"id": "invoice-credit-paid", "season_code": "2627", "document_number": "2627FAC0001",
             "sale_id": "sale-credit-paid", "buyer_id": "buyer-credit-paid",
             "total_amount_dt": Decimal128("500.000"), "paid_amount_dt": Decimal128("500.000"),
             "outstanding_amount_dt": Decimal128("0.000"), "payment_status": "PAID", "version": 1},
            {"id": "invoice-credit-partial", "season_code": "2627", "document_number": "2627FAC0002",
             "sale_id": "sale-credit-partial", "buyer_id": "buyer-credit-partial",
             "total_amount_dt": Decimal128("500.000"), "paid_amount_dt": Decimal128("200.000"),
             "outstanding_amount_dt": Decimal128("300.000"), "payment_status": "PARTIALLY_PAID", "version": 1},
        ])
        await db.commercial_sale_payments.insert_many([
            {"id": "payment-credit-paid", "season_code": "2627", "document_type": "PAY",
             "document_number": "2627PAY0001", "invoice_id": "invoice-credit-paid",
             "sale_id": "sale-credit-paid", "buyer_id": "buyer-credit-paid",
             "payment_date": "2026-10-20", "amount_dt": Decimal128("500.000"),
             "method": "CASH", "idempotency_scope": "2627:test",
             "idempotency_key": "payment-credit-paid-key", "created_at": now},
            {"id": "payment-credit-partial", "season_code": "2627", "document_type": "PAY",
             "document_number": "2627PAY0002", "invoice_id": "invoice-credit-partial",
             "sale_id": "sale-credit-partial", "buyer_id": "buyer-credit-partial",
             "payment_date": "2026-10-20", "amount_dt": Decimal128("200.000"),
             "method": "CASH", "idempotency_scope": "2627:test",
             "idempotency_key": "payment-credit-partial-key", "created_at": now},
        ])
        await db.commercial_sale_returns.insert_many([
            {"id": "return-credit-paid", "season_code": "2627", "document_number": "2627RET0001",
             "sale_id": "sale-credit-paid", "invoice_id": "invoice-credit-paid",
             "buyer_id": "buyer-credit-paid", "returned_oil_lot_id": "returned-credit-lot-1",
             "quantity_kg": Decimal128("10.000"), "status": "RECEIVED",
             "commercial_acceptance_status": "PENDING", "version": 1,
             "idempotency_scope": "return:test", "idempotency_key": "return-credit-paid-key"},
            {"id": "return-credit-partial", "season_code": "2627", "document_number": "2627RET0002",
             "sale_id": "sale-credit-partial", "invoice_id": "invoice-credit-partial",
             "buyer_id": "buyer-credit-partial", "returned_oil_lot_id": "returned-credit-lot-2",
             "quantity_kg": Decimal128("20.000"), "status": "RECEIVED",
             "commercial_acceptance_status": "PENDING", "version": 1,
             "idempotency_scope": "return:test", "idempotency_key": "return-credit-partial-key"},
        ])
        paid_command = AcceptSaleReturnCommand(
            expected_return_version=1, reason="Commercial return accepted after inspection",
            idempotency_key="accept-return-credit-paid-001",
        )

        async def accept_paid(active_session):
            return await accept_sale_return_and_issue_credit_note(
                db, "return-credit-paid", paid_command, season_code="2627",
                actor_user=admin, actor_user_id="credit-admin",
                credit_note_id="credit-note-paid", buyer_credit_entry_id="buyer-credit-entry-paid",
                audit_event_id="credit-audit-paid", decided_at=now, session=active_session,
            )

        async with await client.start_session() as session:
            paid_note = await session.with_transaction(accept_paid)
        assert paid_note["document_number"] == "2627AVO0001"
        assert paid_note["amount_dt"].to_decimal() == Decimal("50.000")

        paid_invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-credit-paid"})
        assert paid_invoice["total_amount_dt"].to_decimal() == Decimal("500.000")
        assert paid_invoice["credited_amount_dt"].to_decimal() == Decimal("50.000")
        assert paid_invoice["net_amount_dt"].to_decimal() == Decimal("450.000")
        assert paid_invoice["outstanding_amount_dt"].to_decimal() == Decimal("0.000")
        assert paid_invoice["paid_amount_dt"].to_decimal() == Decimal("500.000")
        paid_buyer = await db.commercial_buyers.find_one({"id": "buyer-credit-paid"})
        assert paid_buyer["credit_balance_dt"].to_decimal() == Decimal("50.000")

        # Same command is idempotent and does not create another AVO or ledger entry.
        async with await client.start_session() as session:
            repeated = await session.with_transaction(accept_paid)
        assert repeated["id"] == "credit-note-paid"
        assert await db.commercial_credit_notes.count_documents({}) == 1
        assert await db.commercial_buyer_credit_ledger.count_documents({}) == 1

        partial_command = AcceptSaleReturnCommand(
            expected_return_version=1, reason="Partial invoice return accepted",
            idempotency_key="accept-return-credit-partial-001",
        )
        async with await client.start_session() as session:
            partial_note = await session.with_transaction(
                lambda active: accept_sale_return_and_issue_credit_note(
                    db, "return-credit-partial", partial_command, season_code="2627",
                    actor_user=admin, actor_user_id="credit-admin",
                    credit_note_id="credit-note-partial", buyer_credit_entry_id="buyer-credit-entry-partial",
                    audit_event_id="credit-audit-partial", decided_at=now, session=active,
                )
            )
        assert partial_note["amount_dt"].to_decimal() == Decimal("100.000")
        partial_invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-credit-partial"})
        assert partial_invoice["net_amount_dt"].to_decimal() == Decimal("400.000")
        assert partial_invoice["outstanding_amount_dt"].to_decimal() == Decimal("200.000")
        assert partial_invoice["paid_amount_dt"].to_decimal() == Decimal("200.000")
        assert partial_invoice["payment_status"] == "PARTIALLY_PAID"
        partial_buyer = await db.commercial_buyers.find_one({"id": "buyer-credit-partial"})
        assert partial_buyer["credit_balance_dt"].to_decimal() == Decimal("0.000")

        accepted = await db.commercial_sale_returns.find_one({"id": "return-credit-paid"})
        assert accepted["commercial_acceptance_status"] == "ACCEPTED"
        assert accepted["credit_note_id"] == "credit-note-paid"
        assert await db.commercial_sale_payments.count_documents({}) == 0
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_concurrent_sale_returns_cannot_over_return_same_dispatch():
    from decimal import Decimal
    from bson.decimal128 import Decimal128
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.returns import SaleReturnDraft
    from commercial.services.sale_returns import receive_wholesale_sale_return

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "sale_return_concurrency_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "RET", "last_sequence": 0},
            {"season_code": "2627", "document_type": "LOT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
        ])
        await db.commercial_tanks.insert_one({
            "id": "tank-concurrent-quarantine", "active": True,
            "role": "QUARANTINE", "version": 1,
        })
        await db.commercial_lots.insert_one({
            "id": "original-concurrent-lot", "product_kind": "OIL",
            "owner": {"kind": "MILL"}, "status": "OPEN", "quality_status": "RELEASED",
        })
        await db.commercial_sales.insert_one({
            "id": "sale-concurrent-return", "season_code": "2627",
            "document_number": "2627VTE0099", "status": "APPROVED", "version": 2,
            "invoice_id": "invoice-concurrent-return", "buyer_id": "buyer-concurrent-return",
            "oil_lot_id": "original-concurrent-lot", "quantity_kg": Decimal128("100.000"),
            "unit_price_dt": Decimal128("5.000"), "total_amount_dt": Decimal128("500.000"),
            "returned_quantity_kg": Decimal128("0.000"),
            "idempotency_scope": "concurrency:sale", "idempotency_key": "concurrent-sale-key",
        })
        await db.commercial_sales_invoices.insert_one({
            "id": "invoice-concurrent-return", "sale_id": "sale-concurrent-return",
            "buyer_id": "buyer-concurrent-return", "season_code": "2627",
            "document_number": "2627FAC0099", "total_amount_dt": Decimal128("500.000"),
            "paid_amount_dt": Decimal128("0.000"), "outstanding_amount_dt": Decimal128("500.000"),
            "payment_status": "UNPAID", "version": 1,
        })

        async def receive(index: int):
            draft = SaleReturnDraft(
                expected_sale_version=2, quantity_kg=Decimal("60.000"),
                quarantine_tank_id="tank-concurrent-quarantine",
                reason=f"Concurrent return attempt {index}",
                idempotency_key=f"concurrent-return-key-{index:02d}",
            )
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: receive_wholesale_sale_return(
                        db, "sale-concurrent-return", draft, season_code="2627",
                        actor_user=admin, actor_user_id="concurrent-admin",
                        return_id=f"return-concurrent-{index}",
                        returned_lot_id=f"lot-concurrent-{index}",
                        stock_movement_id=f"movement-concurrent-{index}",
                        audit_event_id=f"audit-concurrent-{index}",
                        created_at=now, session=active,
                    )
                )

        results = await asyncio.gather(receive(1), receive(2), return_exceptions=True)
        successes = [result for result in results if isinstance(result, dict)]
        failures = [result for result in results if isinstance(result, Exception)]
        assert len(successes) == 1
        assert len(failures) == 1
        sale = await db.commercial_sales.find_one({"id": "sale-concurrent-return"})
        assert sale["returned_quantity_kg"].to_decimal() == Decimal("60.000")
        assert sale["version"] == 3
        assert await db.commercial_sale_returns.count_documents({}) == 1
        assert await db.commercial_stock_movements.count_documents({
            "source_document_type": "RET",
        }) == 1
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_stock_movement_rejects_product_kind_mismatch_with_lot():
    from decimal import Decimal

    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from commercial.schemas.inventory import OwnerRef, StockMovementDraft
    from commercial.services.stock_ledger import post_stock_movement

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "stock_product_kind_mismatch_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_lots.insert_one({
            "id": "oil-lot-used-as-olive",
            "season_code": "2627",
            "document_type": "LOT",
            "document_number": "2627LOT0001",
            "product_kind": "OIL",
            "owner": {"kind": "MILL"},
            "status": "OPEN",
        })
        await db.commercial_locations.insert_one({
            "id": "olive-storage-mismatch",
            "code": "OLIVE-MISMATCH",
            "kind": "OLIVE_STORAGE",
            "active": True,
        })
        draft = StockMovementDraft(
            movement_kind="RECEIPT",
            product_kind="OLIVE",
            lot_id="oil-lot-used-as-olive",
            quantity_kg=Decimal("10.000"),
            destination_location_id="olive-storage-mismatch",
            destination_owner=OwnerRef(kind="MILL"),
            source_document_type="ACH",
            source_document_id="not-reached-because-lot-kind-is-invalid",
            idempotency_key="stock-product-kind-mismatch-001",
            reason="Reject cross-product stock posting",
        )
        with pytest.raises(ValueError, match="does not match lot product kind"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: post_stock_movement(
                        db, draft,
                        season_code="2627",
                        actor_user_id="integration-admin",
                        actor_user={"active": True, "role": "admin"},
                        movement_id="stock-product-kind-mismatch-movement",
                        audit_event_id="stock-product-kind-mismatch-audit",
                        created_at=now,
                        session=active,
                    )
                )
        assert await db.commercial_stock_movements.count_documents({}) == 0
        assert await db.commercial_stock_balances.count_documents({}) == 0
    finally:
        await client.drop_database(db_name)
        client.close()

@pytest.mark.asyncio
async def test_traditional_invoice_creation_audit_failure_rolls_back_invoice_and_load_guard(monkeypatch):
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from routers import invoices as invoice_routes

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "traditional_invoice_audit_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    monkeypatch.setattr(invoice_routes, "db", db)
    invoice_id = "invoice-audit-rollback"
    audit_id = "audit-id-conflict"
    try:
        await ensure_inventory_indexes(db)
        await db.invoices.create_index("id", unique=True)
        await db.invoices.create_index("load_id", unique=True, partialFilterExpression={"load_id": {"$type": "string"}})
        await db.commercial_audit_events.insert_one({
            "id": audit_id,
            "entity_type": "test_conflict",
            "entity_id": "preexisting",
            "action": "PREEXISTING",
            "actor_user_id": "integration-admin",
            "created_at": datetime(2026, 11, 2, tzinfo=timezone.utc),
            "details": {},
        })
        await db.loads.insert_one({
            "id": "load-audit-rollback",
            "code": "2627101",
            "client_name": "Audit rollback client",
            "phone": "21600000000",
            "olive_kg": 100.0,
            "oil_kg": 20.0,
            "day": "2026-11-02",
            "cancelled": False,
        })
        await db.settings.insert_one({
            "key": "app",
            "price_per_kg": 1.5,
            "mill_name": "Integration test mill",
        })
        identifiers = iter([invoice_id, audit_id])
        monkeypatch.setattr(invoice_routes.uuid, "uuid4", lambda: next(identifiers))

        with pytest.raises(DuplicateKeyError):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: invoice_routes._create_invoice_in_session(
                        {"load_id": "load-audit-rollback", "paid_amount": 0},
                        {"id": "integration-admin", "username": "admin"},
                        active,
                    )
                )

        assert await db.invoices.count_documents({}) == 0
        load = await db.loads.find_one({"id": "load-audit-rollback"}, {"_id": 0})
        assert "invoice_guard_version" not in load
        assert await db.commercial_audit_events.count_documents({}) == 1
    finally:
        await client.drop_database(db_name)
        client.close()

@pytest.mark.asyncio
async def test_traditional_invoice_update_audit_failure_rolls_back_invoice_values_and_history(monkeypatch):
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from routers import invoices as invoice_routes

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "traditional_invoice_update_audit_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    monkeypatch.setattr(invoice_routes, "db", db)
    try:
        await ensure_inventory_indexes(db)
        await db.invoices.create_index("id", unique=True)
        audit_id = "audit-update-id-conflict"
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "test_conflict", "entity_id": "preexisting",
            "action": "PREEXISTING", "actor_user_id": "integration-admin",
            "created_at": datetime(2026, 11, 2, tzinfo=timezone.utc), "details": {},
        })
        original_updated_at = datetime(2026, 11, 1, tzinfo=timezone.utc)
        await db.invoices.insert_one({
            "id": "invoice-update-rollback", "number": "FAC-2627102",
            "load_id": "load-update-rollback", "client_name": "Update rollback client",
            "oil_kg": 20.0, "price_per_kg": 1.5, "total": 30.0,
            "paid_amount": 5.0, "balance": 25.0,
            "history": [{"action": "created", "after": {"total": 30.0}}],
            "updated_at": original_updated_at,
        })

        async def run_local_transaction(operation):
            async with await client.start_session() as session:
                return await session.with_transaction(operation)

        monkeypatch.setattr(invoice_routes, "run_transaction", run_local_transaction)
        monkeypatch.setattr(invoice_routes.uuid, "uuid4", lambda: audit_id)
        with pytest.raises(DuplicateKeyError):
            await invoice_routes.update_invoice(
                "invoice-update-rollback",
                {"price_per_kg": 2.0},
                {"id": "integration-admin", "username": "admin"},
            )

        invoice = await db.invoices.find_one({"id": "invoice-update-rollback"}, {"_id": 0})
        assert invoice["price_per_kg"] == 1.5
        assert invoice["total"] == 30.0
        assert invoice["balance"] == 25.0
        assert invoice["updated_at"] == original_updated_at
        assert len(invoice["history"]) == 1
        assert await db.commercial_audit_events.count_documents({}) == 1
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_traditional_invoice_delete_audit_failure_restores_deleted_invoice(monkeypatch):
    from commercial.inventory_bootstrap import ensure_inventory_indexes
    from routers import invoices as invoice_routes

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "traditional_invoice_delete_audit_rollback_" + uuid.uuid4().hex
    db = client[db_name]
    monkeypatch.setattr(invoice_routes, "db", db)
    try:
        await ensure_inventory_indexes(db)
        await db.invoices.create_index("id", unique=True)
        audit_id = "audit-delete-id-conflict"
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "test_conflict", "entity_id": "preexisting",
            "action": "PREEXISTING", "actor_user_id": "integration-admin",
            "created_at": datetime(2026, 11, 2, tzinfo=timezone.utc), "details": {},
        })
        await db.invoices.insert_one({
            "id": "invoice-delete-rollback", "number": "FAC-2627103",
            "load_id": "load-delete-rollback", "client_name": "Delete rollback client",
            "oil_kg": 10.0, "price_per_kg": 1.5, "total": 15.0,
            "paid_amount": 3.0, "balance": 12.0,
            "updated_at": datetime(2026, 11, 1, tzinfo=timezone.utc),
        })

        async def run_local_transaction(operation):
            async with await client.start_session() as session:
                return await session.with_transaction(operation)

        monkeypatch.setattr(invoice_routes, "run_transaction", run_local_transaction)
        monkeypatch.setattr(invoice_routes.uuid, "uuid4", lambda: audit_id)
        with pytest.raises(DuplicateKeyError):
            await invoice_routes.delete_invoice(
                "invoice-delete-rollback",
                {"id": "integration-admin", "username": "admin"},
            )

        invoice = await db.invoices.find_one({"id": "invoice-delete-rollback"}, {"_id": 0})
        assert invoice is not None
        assert invoice["number"] == "FAC-2627103"
        assert invoice["total"] == 15.0
        assert invoice["paid_amount"] == 3.0
        assert await db.commercial_audit_events.count_documents({}) == 1
    finally:
        await client.drop_database(db_name)
        client.close()

