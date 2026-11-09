import asyncio
import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from bson.decimal128 import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

from commercial.inventory_bootstrap import ensure_inventory_indexes
from commercial.schemas.customer_custody import (
    CustomerOliveCustodyReceiptDraft,
    CustomerOilCustodyReleaseDraft,
    CancelCustomerCustodyDocumentCommand,
)
from commercial.services.customer_custody import (
    _custody_owner_audit_id,
    _snapshot_fingerprint,
    receive_customer_olive_custody,
    cancel_customer_olive_custody_receipt,
    release_customer_oil_custody,
    get_customer_custody_statement,
)


@pytest.mark.asyncio
async def test_customer_owned_olive_intake_creates_separate_lot_and_balance_atomically():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "customer_custody_intake_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("CIN", "LOT", "MVT", "INT")
        ])
        await db.clients.insert_one({
            "phone": "21612345678", "client_name": "Customer Olive Owner"
        })
        await db.commercial_varieties.insert_one({
            "id": "chemlali", "code": "CH", "name_fr": "Chemlali", "active": True
        })
        await db.settings.insert_one({"key": "app", "varieties": ["chemlali"]})
        await db.commercial_locations.insert_one({
            "id": "olive-yard-01", "code": "OLIVE-01",
            "kind": "OLIVE_STORAGE", "active": True,
        })
        draft = CustomerOliveCustodyReceiptDraft(
            customer_phone="21612345678",
            receipt_date=date(2026, 11, 2),
            variety_id="chemlali",
            quantity_kg=Decimal("1250.500"),
            receiving_location_id="olive-yard-01",
            customer_acknowledgement_reference="ACK-CUSTODY-001",
            idempotency_key="customer-custody-intake-001",
        )

        async def post(receipt_id, owner_id, lot_id, movement_id, audit_id):
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: receive_customer_olive_custody(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        receipt_id=receipt_id, custody_owner_id=owner_id,
                        olive_lot_id=lot_id, stock_movement_id=movement_id,
                        audit_event_id=audit_id, created_at=now, session=active,
                    )
                )

        result = await post("custody-receipt-1", "custody-owner-1", "custody-olive-lot-1", "custody-movement-1", "custody-audit-1")
        assert result["document_number"] == "2627CIN0001"
        owner = await db.commercial_custody_owners.find_one({"client_phone": "21612345678"}, {"_id": 0})
        assert owner["id"] == "custody-owner-1"
        lot = await db.commercial_lots.find_one({"id": "custody-olive-lot-1"}, {"_id": 0})
        assert lot["owner"] == {"kind": "CUSTOMER", "customer_id": "custody-owner-1"}
        assert lot["product_kind"] == "OLIVE"
        balance = await db.commercial_stock_balances.find_one(
            {"product_kind": "OLIVE", "lot_id": "custody-olive-lot-1"}, {"_id": 0}
        )
        assert balance["quantity_kg"].to_decimal() == Decimal("1250.500")
        assert balance["owner"]["kind"] == "CUSTOMER"
        assert await db.commercial_stock_movements.count_documents({}) == 1
        assert await db.commercial_audit_events.count_documents({}) == 3
        owner_created_event = await db.commercial_audit_events.find_one({
            "entity_type": "customer_custody_owner",
            "entity_id": "custody-owner-1",
            "action": "CUSTOMER_CUSTODY_OWNER_CREATED",
        })
        assert owner_created_event["actor_user_id"] == "integration-admin"
        assert owner_created_event["details"]["after"]["client_name"] == "Customer Olive Owner"

        # A phone/name change on the legacy client keeps the same custody owner identity.
        await db.clients.update_one(
            {"phone": "21612345678"},
            {"$set": {"phone": "21698765432", "client_name": "Updated Customer Name"}},
        )
        changed_phone_draft = CustomerOliveCustodyReceiptDraft(
            customer_phone="21698765432",
            receipt_date=date(2026, 11, 2),
            variety_id="chemlali",
            quantity_kg=Decimal("100.000"),
            receiving_location_id="olive-yard-01",
            customer_acknowledgement_reference="ACK-CUSTODY-002",
            idempotency_key="customer-custody-intake-002",
        )
        async with await client.start_session() as session:
            await session.with_transaction(
                lambda active: receive_customer_olive_custody(
                    db, changed_phone_draft, season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    receipt_id="custody-receipt-2", custody_owner_id="unused-new-owner",
                    olive_lot_id="custody-olive-lot-2", stock_movement_id="custody-movement-2",
                    audit_event_id="custody-audit-2",
                    created_at=now, session=active,
                )
            )
        updated_owner = await db.commercial_custody_owners.find_one({"legacy_client_id": owner["legacy_client_id"]}, {"_id": 0})
        assert updated_owner["id"] == "custody-owner-1"
        assert updated_owner["client_phone"] == "21698765432"
        assert updated_owner["client_name"] == "Updated Customer Name"
        assert await db.commercial_custody_owners.count_documents({}) == 1
        owner_updated_event = await db.commercial_audit_events.find_one({
            "entity_type": "customer_custody_owner",
            "entity_id": "custody-owner-1",
            "action": "CUSTOMER_CUSTODY_OWNER_UPDATED",
        })
        assert owner_updated_event["actor_user_id"] == "integration-admin"
        assert owner_updated_event["details"]["before"]["client_phone"] == "21612345678"
        assert owner_updated_event["details"]["after"]["client_phone"] == "21698765432"
        assert owner_updated_event["details"]["before"]["client_name"] == "Customer Olive Owner"
        assert owner_updated_event["details"]["after"]["client_name"] == "Updated Customer Name"
        assert await db.commercial_audit_events.count_documents({}) == 6
        statement = await get_customer_custody_statement(db, "custody-owner-1")
        assert statement["ledger_totals_kg"]["OLIVE"] == Decimal("1350.500")
        assert statement["current_balances_kg"]["OLIVE"] == Decimal("1350.500")
        assert statement["movement_count"] == 2

        # Same idempotency key returns the original receipt even with new generated IDs.
        repeated = await post("unused-receipt-id", "unused-owner-id", "unused-lot-id", "unused-movement-id", "unused-audit-id")
        assert repeated["id"] == result["id"]
        assert await db.commercial_customer_custody_receipts.count_documents({}) == 2
        assert await db.commercial_lots.count_documents({}) == 2
        assert await db.commercial_stock_movements.count_documents({}) == 2
        assert await db.commercial_audit_events.count_documents({}) == 6
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_custody_owner_creation_rolls_back_when_audit_insert_fails():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "custody_owner_rollback_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    owner_id = "custody-owner-audit-rollback"
    owner_snapshot = {
        "client_phone": "21612345678",
        "client_name": "Rollback Customer",
        "active": True,
        "version": 1,
    }
    fingerprint = _snapshot_fingerprint({"owner_id": owner_id, "after": owner_snapshot})
    conflicting_audit_id = _custody_owner_audit_id(owner_id, "CREATED", now, fingerprint)
    try:
        await ensure_inventory_indexes(db)
        await db.clients.insert_one({
            "phone": "21612345678",
            "client_name": "Rollback Customer",
        })
        await db.commercial_audit_events.insert_one({
            "id": conflicting_audit_id,
            "entity_type": "test",
            "entity_id": "pre-existing",
            "action": "PREEXISTING",
            "actor_user_id": "integration-admin",
            "created_at": now,
        })
        draft = CustomerOliveCustodyReceiptDraft(
            customer_phone="21612345678",
            receipt_date=date(2026, 11, 2),
            variety_id="chemlali",
            quantity_kg=Decimal("10.000"),
            receiving_location_id="olive-yard-01",
            customer_acknowledgement_reference="ACK-ROLLBACK-001",
            idempotency_key="customer-custody-owner-rollback-001",
        )
        with pytest.raises(DuplicateKeyError):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: receive_customer_olive_custody(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        receipt_id="rollback-receipt-1",
                        custody_owner_id=owner_id,
                        olive_lot_id="rollback-olive-lot-1",
                        stock_movement_id="rollback-movement-1",
                        audit_event_id="rollback-receipt-audit-1",
                        created_at=now, session=active,
                    )
                )
        assert await db.commercial_custody_owners.count_documents({}) == 0
        assert await db.commercial_customer_custody_receipts.count_documents({}) == 0
        assert await db.commercial_lots.count_documents({}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
        assert await db.commercial_audit_events.count_documents({}) == 1
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_customer_oil_pickup_debits_only_matching_customer_stock():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "customer_custody_pickup_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("CUS", "MVT")
        ])
        await db.commercial_custody_owners.insert_one({
            "id": "custody-owner-a", "legacy_client_id": "legacy-client-a", "client_phone": "21612345678",
            "client_name": "Customer A", "active": True,
        })
        await db.commercial_tanks.insert_one({
            "id": "tank-01", "code": "T01", "active": True, "role": "NORMAL"
        })
        await db.commercial_lots.insert_one({
            "id": "customer-oil-lot-a", "season_code": "2627",
            "document_type": "LOT", "document_number": "2627LOT0001",
            # The lot records its origin; the balance is currently customer-owned after an ownership transfer.
            "product_kind": "OIL", "owner": {"kind": "MILL"},
            "quality_status": "RELEASED", "status": "OPEN", "version": 1,
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "customer-oil-lot-a",
            "owner": {"kind": "CUSTOMER", "customer_id": "custody-owner-a"},
            "location_id": "tank-01", "quantity_kg": Decimal128("50.000"),
        })
        draft = CustomerOilCustodyReleaseDraft(
            customer_id="custody-owner-a",
            release_date=date(2026, 11, 2),
            oil_lot_id="customer-oil-lot-a",
            source_tank_id="tank-01",
            quantity_kg=Decimal("20.000"),
            customer_acknowledgement_reference="ACK-PICKUP-001",
            reason="Customer collected own released oil",
            idempotency_key="customer-oil-pickup-001",
        )
        async with await client.start_session() as session:
            result = await session.with_transaction(
                lambda active: release_customer_oil_custody(
                    db, draft, season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    release_id="custody-release-1",
                    stock_movement_id="custody-dispatch-1",
                    audit_event_id="custody-release-audit-1",
                    created_at=now, session=active,
                )
            )
        assert result["document_number"] == "2627CUS0001"
        balance = await db.commercial_stock_balances.find_one(
            {"product_kind": "OIL", "lot_id": "customer-oil-lot-a"}, {"_id": 0}
        )
        assert balance["quantity_kg"].to_decimal() == Decimal("30.000")
        movement = await db.commercial_stock_movements.find_one(
            {"source_document_type": "CUS"}, {"_id": 0}
        )
        assert movement["movement_kind"] == "DISPATCH"
        assert movement["source_owner"]["customer_id"] == "custody-owner-a"
        statement = await get_customer_custody_statement(db, "custody-owner-a")
        assert statement["ledger_totals_kg"]["OIL"] == Decimal("30.000")
        assert statement["current_balances_kg"]["OIL"] == Decimal("30.000")
        assert statement["movements"][-1]["delta_kg"] == Decimal("-20.000")
        assert await db.commercial_audit_events.count_documents({}) == 2
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_customer_oil_pickup_rejects_other_customer_and_pending_quality():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "customer_custody_reject_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("CUS", "MVT")
        ])
        await db.commercial_custody_owners.insert_one({
            "id": "custody-owner-a", "legacy_client_id": "legacy-client-a", "client_phone": "21612345678",
            "client_name": "Customer A", "active": True,
        })
        await db.commercial_tanks.insert_one({
            "id": "tank-01", "active": True, "role": "NORMAL"
        })
        await db.commercial_lots.insert_one({
            "id": "customer-oil-lot-b", "season_code": "2627",
            "product_kind": "OIL", "owner": {"kind": "CUSTOMER", "customer_id": "custody-owner-b"},
            "quality_status": "RELEASED", "status": "OPEN", "version": 1,
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "customer-oil-lot-b",
            "owner": {"kind": "CUSTOMER", "customer_id": "custody-owner-b"},
            "location_id": "tank-01", "quantity_kg": Decimal128("10.000"),
        })
        draft = CustomerOilCustodyReleaseDraft(
            customer_id="custody-owner-a", release_date=date(2026, 11, 2),
            oil_lot_id="customer-oil-lot-b", source_tank_id="tank-01",
            quantity_kg=Decimal("1.000"), customer_acknowledgement_reference="ACK-001",
            reason="Attempt cross-customer pickup", idempotency_key="cross-customer-pickup-001",
        )
        with pytest.raises(ValueError, match="does not belong"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: release_customer_oil_custody(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        release_id="cross-release-1", stock_movement_id="cross-movement-1",
                        audit_event_id="cross-audit-1",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                        session=active,
                    )
                )
        assert await db.commercial_customer_custody_releases.count_documents({}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_customer_pickup_cannot_release_pending_quality_oil():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "custody_pending_quality_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_custody_owners.insert_one({
            "id": "custody-owner-a", "client_phone": "21612345678",
            "client_name": "Customer A", "active": True,
        })
        await db.commercial_tanks.insert_one({"id": "tank-01", "active": True, "role": "NORMAL"})
        await db.commercial_lots.insert_one({
            "id": "pending-customer-oil", "product_kind": "OIL",
            "owner": {"kind": "CUSTOMER", "customer_id": "custody-owner-a"},
            "quality_status": "PENDING", "status": "OPEN",
        })
        draft = CustomerOilCustodyReleaseDraft(
            customer_id="custody-owner-a", release_date=date(2026, 11, 2),
            oil_lot_id="pending-customer-oil", source_tank_id="tank-01",
            quantity_kg=Decimal("1.000"), customer_acknowledgement_reference="ACK-002",
            reason="Attempt pickup before quality release", idempotency_key="pending-quality-pickup-001",
        )
        with pytest.raises(ValueError, match="quality release"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: release_customer_oil_custody(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        release_id="pending-release-1", stock_movement_id="pending-movement-1",
                        audit_event_id="pending-audit-1",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                        session=active,
                    )
                )
        assert await db.commercial_customer_custody_releases.count_documents({}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_custody_receipt_reserves_partial_and_remaining_quantity_from_original_load():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "custody_source_load_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 0}
            for kind in ("CIN", "LOT", "MVT", "INT")
        ])
        await db.clients.insert_one({
            "phone": "21612345678", "client_name": "Source Load Customer"
        })
        await db.settings.insert_one({"key": "app", "varieties": ["chemlali"]})
        await db.commercial_locations.insert_one({
            "id": "source-load-yard", "kind": "OLIVE_STORAGE", "active": True,
        })
        await db.loads.insert_one({
            "id": "traditional-load-001",
            "code": "2627A0001",
            "season_id": "2627",
            "day": "2026-11-02",
            "phone": "21612345678",
            "client_name": "Source Load Customer",
            "variety": "chemlali",
            "olive_kg": Decimal128("1000.000"),
            "oil_kg": None,
            "pressing": False,
            "cancelled": False,
        })

        async def receive(quantity, key, suffix):
            draft = CustomerOliveCustodyReceiptDraft(
                customer_phone="21612345678",
                receipt_date=date(2026, 11, 2),
                variety_id="chemlali",
                quantity_kg=Decimal(quantity),
                source_load_id="traditional-load-001",
                receiving_location_id="source-load-yard",
                customer_acknowledgement_reference=f"ACK-SOURCE-{suffix}",
                idempotency_key=key,
            )
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: receive_customer_olive_custody(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        receipt_id=f"source-receipt-{suffix}",
                        custody_owner_id=f"source-owner-{suffix}",
                        olive_lot_id=f"source-lot-{suffix}",
                        stock_movement_id=f"source-movement-{suffix}",
                        audit_event_id=f"source-audit-{suffix}",
                        created_at=now, session=active,
                    )
                )

        first = await receive("400.000", "custody-source-load-partial-001", "partial")
        assert first["source_load_id"] == "traditional-load-001"
        assert first["source_load_code"] == "2627A0001"
        first_lot = await db.commercial_lots.find_one({"id": "source-lot-partial"}, {"_id": 0})
        assert first_lot["source_load_id"] == "traditional-load-001"
        assert first_lot["source_load_code"] == "2627A0001"
        second = await receive("600.000", "custody-source-load-final-001", "final")
        assert second["quantity_kg"].to_decimal() == Decimal("600.000")

        with pytest.raises(ValueError, match="exceeds the source load"):
            await receive("0.001", "custody-source-load-overrun-001", "overrun")

        async with await client.start_session() as session:
            cancelled = await session.with_transaction(
                lambda active: cancel_customer_olive_custody_receipt(
                    db, second["id"],
                    CancelCustomerCustodyDocumentCommand(
                        expected_version=1,
                        reason="Return the remaining unneeded olives",
                    ),
                    season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    reversal_document_id="source-reversal-final",
                    stock_movement_id="source-reversal-movement-final",
                    audit_event_id="source-reversal-audit-final",
                    cancelled_at=now, session=active,
                )
            )
        assert cancelled["status"] == "CANCELLED"
        source_load = await db.loads.find_one(
            {"id": "traditional-load-001"}, {"_id": 0}
        )
        assert source_load["custody_received_kg"].to_decimal() == Decimal("400.000")
        assert await db.commercial_customer_custody_receipts.count_documents({
            "source_load_id": "traditional-load-001",
            "status": "RECEIVED",
        }) == 1
        assert await db.commercial_lots.count_documents({}) == 2
    finally:
        await client.drop_database(name)
        client.close()
