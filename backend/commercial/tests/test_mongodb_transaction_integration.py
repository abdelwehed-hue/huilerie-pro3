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
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "MVT", "last_sequence": 0,
        })
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
        assert result["stock_movement_id"] == "stock-movement-1"
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
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "MVT", "last_sequence": 0,
        })
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
        with pytest.raises(ValueError, match="Customer-custody oil cannot be sold"):
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
            "product_kind": "OIL", "status": "OPEN", "owner": {"kind": "MILL"},
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
            "id": "buyer-summary-1", "name": "Historical Buyer", "active": False,
        })
        await test_db.commercial_sales_invoices.insert_many([
            {
                "id": "invoice-summary-1", "buyer_id": "buyer-summary-1",
                "total_amount_dt": Decimal128("100.000"),
                "paid_amount_dt": Decimal128("25.000"),
                "outstanding_amount_dt": Decimal128("75.000"),
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
        assert result["summary"]["total_amount_dt"] == "150.500"
        assert result["summary"]["paid_amount_dt"] == "75.500"
        assert result["summary"]["outstanding_amount_dt"] == "75.000"
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
