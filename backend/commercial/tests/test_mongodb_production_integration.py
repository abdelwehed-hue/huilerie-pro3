import asyncio
import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from bson.decimal128 import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient

from commercial.inventory_bootstrap import ensure_inventory_indexes
from commercial.schemas.production import CommercialProductionDraft
from commercial.services.production import complete_commercial_production


@pytest.mark.asyncio
async def test_production_posts_olive_and_oil_balances_atomically():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "commercial_production_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 2 if kind == "LOT" else 0}
            for kind in ("PROD", "LOT", "MVT")
        ])
        await db.commercial_tanks.insert_one({"id": "tank-01", "active": True})
        await db.commercial_locations.insert_one({
            "id": "yard-1", "active": True, "kind": "OLIVE_STORAGE"
        })
        await db.commercial_lots.insert_many([
            # Lot owner is origin metadata; the current owner is recorded per stock balance.
            {"id": "olive-1", "season_code": "2627", "document_number": "2627LOT0001", "product_kind": "OLIVE", "owner": {"kind": "CUSTOMER", "customer_id": "customer-origin"}, "status": "OPEN"},
            {"id": "olive-2", "season_code": "2627", "document_number": "2627LOT0002", "product_kind": "OLIVE", "owner": {"kind": "MILL"}, "status": "OPEN"},
        ])
        await db.commercial_stock_balances.insert_many([
            {"product_kind": "OLIVE", "lot_id": lot, "owner": {"kind": "MILL"},
             "location_id": "yard-1", "quantity_kg": Decimal128("500")}
            for lot in ("olive-1", "olive-2")
        ])
        draft = CommercialProductionDraft(
            production_date=date(2026, 11, 2),
            inputs=[
                {"olive_lot_id": lot, "source_location_id": "yard-1",
                 "owner": {"kind": "MILL"}, "quantity_kg": "500"}
                for lot in ("olive-1", "olive-2")
            ],
            actual_oil_output_kg="180.500", output_tank_id="tank-01",
            idempotency_key="real-mongo-production-post-0001",
        )
        async with await client.start_session() as session:
            result = await session.with_transaction(
                lambda active: complete_commercial_production(
                    db, draft, season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    production_id="production-integration-1",
                    created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                    session=active,
                )
            )
        assert result["document_number"] == "2627PROD0001"
        assert result["owner"] == {"kind": "MILL"}
        origin_lot = await db.commercial_lots.find_one({"id": "olive-1"}, {"_id": 0})
        assert origin_lot["owner"] == {"kind": "CUSTOMER", "customer_id": "customer-origin"}
        assert await db.commercial_stock_movements.count_documents({}) == 3
        olive = await db.commercial_stock_balances.find(
            {"product_kind": "OLIVE"}, {"_id": 0}
        ).to_list(10)
        assert all(row["quantity_kg"].to_decimal() == Decimal("0") for row in olive)
        oil = await db.commercial_stock_balances.find_one(
            {"product_kind": "OIL"}, {"_id": 0}
        )
        assert oil["quantity_kg"].to_decimal() == Decimal("180.500")
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_insufficient_olive_stock_rolls_back_entire_production_command():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "commercial_rollback_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind,
             "last_sequence": 2 if kind == "LOT" else 0}
            for kind in ("PROD", "LOT", "MVT")
        ])
        await db.commercial_tanks.insert_one({"id": "tank-01", "active": True})
        await db.commercial_locations.insert_one({
            "id": "yard-1", "active": True, "kind": "OLIVE_STORAGE"
        })
        await db.commercial_lots.insert_many([
            {"id": "olive-1", "season_code": "2627", "document_number": "2627LOT0001",
             "product_kind": "OLIVE", "owner": {"kind": "MILL"}, "status": "OPEN"},
            {"id": "olive-2", "season_code": "2627", "document_number": "2627LOT0002",
             "product_kind": "OLIVE", "owner": {"kind": "MILL"}, "status": "OPEN"},
        ])
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OLIVE", "lot_id": "olive-1",
            "owner": {"kind": "MILL"}, "location_id": "yard-1",
            "quantity_kg": Decimal128("500"),
        })
        draft = CommercialProductionDraft(
            production_date=date(2026, 11, 2),
            inputs=[
                {"olive_lot_id": lot, "source_location_id": "yard-1",
                 "owner": {"kind": "MILL"}, "quantity_kg": "500"}
                for lot in ("olive-1", "olive-2")
            ],
            actual_oil_output_kg="180.500", output_tank_id="tank-01",
            idempotency_key="real-mongo-production-rollback-0001",
        )
        with pytest.raises(ValueError, match="Insufficient stock"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: complete_commercial_production(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        production_id="production-rollback-integration",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
                        session=active,
                    )
                )
        assert await db.commercial_production_runs.count_documents({}) == 0
        assert await db.commercial_lots.count_documents({"product_kind": "OIL"}) == 0
        assert await db.commercial_stock_movements.count_documents({}) == 0
        assert await db.commercial_audit_events.count_documents({}) == 0
        balance = await db.commercial_stock_balances.find_one(
            {"product_kind": "OLIVE", "lot_id": "olive-1"}, {"_id": 0}
        )
        assert balance["quantity_kg"].to_decimal() == Decimal("500")
        prod_counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "PROD"}, {"_id": 0}
        )
        lot_counter = await db.commercial_counters.find_one(
            {"season_code": "2627", "document_type": "LOT"}, {"_id": 0}
        )
        assert prod_counter["last_sequence"] == 0
        assert lot_counter["last_sequence"] == 2
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_concurrent_productions_cannot_consume_the_same_olive_stock_twice():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "commercial_concurrent_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_many([
            {"season_code": "2627", "document_type": kind, "last_sequence": 1 if kind == "LOT" else 0}
            for kind in ("PROD", "LOT", "MVT")
        ])
        await db.commercial_tanks.insert_one({"id": "tank-01", "active": True})
        await db.commercial_locations.insert_one({
            "id": "yard-1", "active": True, "kind": "OLIVE_STORAGE"
        })
        await db.commercial_lots.insert_one({
            "id": "shared-olive-lot", "season_code": "2627",
            "document_number": "2627LOT0001", "product_kind": "OLIVE",
            "owner": {"kind": "MILL"}, "status": "OPEN",
        })
        await db.commercial_stock_balances.insert_one({
            "product_kind": "OLIVE", "lot_id": "shared-olive-lot",
            "owner": {"kind": "MILL"}, "location_id": "yard-1",
            "quantity_kg": Decimal128("500"),
        })

        async def attempt(run_id: str, key: str):
            draft = CommercialProductionDraft(
                production_date=date(2026, 11, 2),
                inputs=[{
                    "olive_lot_id": "shared-olive-lot",
                    "source_location_id": "yard-1",
                    "owner": {"kind": "MILL"},
                    "quantity_kg": "500",
                }],
                actual_oil_output_kg="100",
                output_tank_id="tank-01",
                idempotency_key=key,
            )
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: complete_commercial_production(
                        db, draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        production_id=run_id,
                        created_at=datetime.now(timezone.utc),
                        session=active,
                    )
                )

        outcomes = await asyncio.gather(
            attempt("concurrent-run-a", "concurrent-production-key-a"),
            attempt("concurrent-run-b", "concurrent-production-key-b"),
            return_exceptions=True,
        )
        successes = [item for item in outcomes if isinstance(item, dict)]
        failures = [item for item in outcomes if isinstance(item, Exception)]
        assert len(successes) == 1, outcomes
        assert len(failures) == 1, outcomes
        assert isinstance(failures[0], ValueError)
        assert await db.commercial_production_runs.count_documents({"status": "COMPLETED"}) == 1
        assert await db.commercial_stock_movements.count_documents({}) == 2
        olive = await db.commercial_stock_balances.find_one(
            {"product_kind": "OLIVE", "lot_id": "shared-olive-lot"}, {"_id": 0}
        )
        assert olive["quantity_kg"].to_decimal() == Decimal("0")
        oil = await db.commercial_stock_balances.find_one(
            {"product_kind": "OIL"}, {"_id": 0}
        )
        assert oil["quantity_kg"].to_decimal() == Decimal("100")
    finally:
        await client.drop_database(name)
        client.close()
