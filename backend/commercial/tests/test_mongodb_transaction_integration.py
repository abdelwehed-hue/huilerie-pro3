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
