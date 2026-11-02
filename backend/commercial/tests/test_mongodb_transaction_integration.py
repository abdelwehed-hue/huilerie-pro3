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
