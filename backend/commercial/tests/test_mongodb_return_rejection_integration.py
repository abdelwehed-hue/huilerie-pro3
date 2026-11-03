import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from bson.decimal128 import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient

from commercial.inventory_bootstrap import ensure_inventory_indexes
from commercial.schemas.return_rejection import RejectSaleReturnCommand
from commercial.services.return_rejection import reject_sale_return_and_dispatch_to_buyer


@pytest.mark.asyncio
async def test_rejecting_received_return_dispatches_quarantined_oil_and_reopens_return_allowance():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "sale_return_rejection_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "RJT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
        ])
        await db.commercial_tanks.insert_one({
            "id": "tank-rejection-quarantine", "active": True,
            "role": "QUARANTINE", "version": 1,
        })
        await db.commercial_sales.insert_one({
            "id": "sale-rejection", "status": "APPROVED", "version": 4,
            "buyer_id": "buyer-rejection",
            "returned_quantity_kg": Decimal128("10.000"),
        })
        await db.commercial_sale_returns.insert_one({
            "id": "return-rejection", "season_code": "2627",
            "document_number": "2627RET0001", "sale_id": "sale-rejection",
            "buyer_id": "buyer-rejection", "returned_oil_lot_id": "returned-lot-rejection",
            "quarantine_tank_id": "tank-rejection-quarantine",
            "quantity_kg": Decimal128("10.000"), "status": "RECEIVED",
            "commercial_acceptance_status": "PENDING", "version": 1,
        })
        await db.commercial_lots.insert_one({
            "id": "returned-lot-rejection", "product_kind": "OIL",
            "source_sale_return_id": "return-rejection", "status": "OPEN",
            "owner": {"kind": "MILL"}, "quality_status": "PENDING", "version": 1,
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OIL", "lot_id": "returned-lot-rejection",
            "owner": {"kind": "MILL"}, "location_id": "tank-rejection-quarantine",
            "quantity_kg": Decimal128("10.000"), "created_at": now,
        })
        command = RejectSaleReturnCommand(
            rejection_date="2026-11-02", expected_return_version=1,
            reason="Packaging and seal conditions did not meet return policy",
            buyer_receipt_reference="BUYER-RECEIPT-RETURN-001",
            idempotency_key="return-rejection-command-0001",
        )

        async def reject(active):
            return await reject_sale_return_and_dispatch_to_buyer(
                db, "return-rejection", command, season_code="2627",
                actor_user=admin, actor_user_id="rejection-admin",
                rejection_id="rejection-doc-1", movement_id="rejection-movement-1",
                audit_event_id="rejection-audit-1", decided_at=now, session=active,
            )

        async with await client.start_session() as session:
            result = await session.with_transaction(reject)
        assert result["document_number"] == "2627RJT0001"
        assert result["status"] == "APPROVED"
        assert result["stock_movement_id"] == "rejection-movement-1"

        returned = await db.commercial_sale_returns.find_one({"id": "return-rejection"})
        assert returned["status"] == "REJECTED"
        assert returned["commercial_acceptance_status"] == "REJECTED"
        assert returned["rejection_id"] == "rejection-doc-1"
        sale = await db.commercial_sales.find_one({"id": "sale-rejection"})
        assert sale["returned_quantity_kg"].to_decimal() == Decimal("0.000")
        assert sale["version"] == 5
        lot = await db.commercial_lots.find_one({"id": "returned-lot-rejection"})
        assert lot["status"] == "CLOSED"
        balance = await db.commercial_stock_balances.find_one({
            "lot_id": "returned-lot-rejection", "location_id": "tank-rejection-quarantine",
        })
        assert balance["quantity_kg"].to_decimal() == Decimal("0.000")
        movement = await db.commercial_stock_movements.find_one({
            "source_document_type": "RJT", "source_document_id": "rejection-doc-1",
        })
        assert movement["movement_kind"] == "DISPATCH"
        assert movement["quantity_kg"].to_decimal() == Decimal("10.000")
        assert await db.commercial_credit_notes.count_documents({"return_id": "return-rejection"}) == 0

        async with await client.start_session() as session:
            repeated = await session.with_transaction(reject)
        assert repeated["id"] == result["id"]
        assert await db.commercial_sale_return_rejections.count_documents({}) == 1
        assert await db.commercial_stock_movements.count_documents({"source_document_type": "RJT"}) == 1
    finally:
        await client.drop_database(db_name)
        client.close()


@pytest.mark.asyncio
async def test_rejected_return_fails_and_rolls_back_when_quarantine_stock_is_missing():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db_name = "sale_return_rejection_missing_stock_" + uuid.uuid4().hex
    db = client[db_name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    admin = {"active": True, "role": "admin"}
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": "RJT", "last_sequence": 0},
            {"season_code": "2627", "document_type": "MVT", "last_sequence": 0},
        ])
        await db.commercial_tanks.insert_one({
            "id": "tank-rejection-quarantine", "active": True,
            "role": "QUARANTINE", "version": 1,
        })
        await db.commercial_sales.insert_one({
            "id": "sale-rejection", "status": "APPROVED", "version": 4,
            "buyer_id": "buyer-rejection", "returned_quantity_kg": Decimal128("10.000"),
        })
        await db.commercial_sale_returns.insert_one({
            "id": "return-rejection", "season_code": "2627", "sale_id": "sale-rejection",
            "buyer_id": "buyer-rejection", "returned_oil_lot_id": "returned-lot-rejection",
            "quarantine_tank_id": "tank-rejection-quarantine",
            "quantity_kg": Decimal128("10.000"), "status": "RECEIVED",
            "commercial_acceptance_status": "PENDING", "version": 1,
        })
        await db.commercial_lots.insert_one({
            "id": "returned-lot-rejection", "product_kind": "OIL",
            "source_sale_return_id": "return-rejection", "status": "OPEN",
            "owner": {"kind": "MILL"}, "quality_status": "PENDING", "version": 1,
        })
        command = RejectSaleReturnCommand(
            rejection_date="2026-11-02", expected_return_version=1,
            reason="Physical stock balance is intentionally absent",
            buyer_receipt_reference="BUYER-RECEIPT-RETURN-002",
            idempotency_key="return-rejection-command-0002",
        )
        with pytest.raises(ValueError, match="Insufficient stock"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: reject_sale_return_and_dispatch_to_buyer(
                        db, "return-rejection", command, season_code="2627",
                        actor_user=admin, actor_user_id="rejection-admin",
                        rejection_id="rejection-doc-2", movement_id="rejection-movement-2",
                        audit_event_id="rejection-audit-2", decided_at=now, session=active,
                    )
                )
        assert await db.commercial_sale_return_rejections.count_documents({}) == 0
        returned = await db.commercial_sale_returns.find_one({"id": "return-rejection"})
        assert returned["status"] == "RECEIVED"
        assert returned["commercial_acceptance_status"] == "PENDING"
        sale = await db.commercial_sales.find_one({"id": "sale-rejection"})
        assert sale["returned_quantity_kg"].to_decimal() == Decimal("10.000")
        lot = await db.commercial_lots.find_one({"id": "returned-lot-rejection"})
        assert lot["status"] == "OPEN"
    finally:
        await client.drop_database(db_name)
        client.close()
