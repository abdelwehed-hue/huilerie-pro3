from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from routers import extras


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def __aiter__(self):
        self._iterator = iter(self.rows)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration:
            raise StopAsyncIteration


class FakeLoads:
    def __init__(self, rows):
        self.rows = rows
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return FakeCursor(self.rows)


@pytest.mark.asyncio
async def test_client_options_are_global_deduplicated_and_paginated(monkeypatch):
    loads = FakeLoads([
        {"_id": "+21611111111", "client_name": "Client A", "last_visit": datetime(2026, 10, 1, tzinfo=timezone.utc)},
        {"_id": "+21622222222", "client_name": "Client B", "last_visit": datetime(2026, 10, 2, tzinfo=timezone.utc)},
    ])
    monkeypatch.setattr(extras, "db", SimpleNamespace(loads=loads))

    rows = await extras.list_client_options(
        limit=2, skip=500, user={"role": "employee"}
    )

    assert [row.phone for row in rows] == ["+21611111111", "+21622222222"]
    assert all(row.loads_count == 0 and row.amount is None for row in rows)
    stages = loads.pipeline
    assert any("$unionWith" in stage and stage["$unionWith"]["coll"] == "clients" for stage in stages)
    assert any(stage == {"$skip": 500} for stage in stages)
    assert any(stage == {"$limit": 2} for stage in stages)
    assert not any("$limit" in stage and stage["$limit"] == 300 for stage in stages)
    timestamp_normalizer = next(stage["$set"]["created_at"] for stage in stages if "$set" in stage)
    assert timestamp_normalizer["$cond"][0] == {"$eq": [{"$type": "$created_at"}, "date"]}
    assert timestamp_normalizer["$cond"][2] == datetime(1970, 1, 1, tzinfo=timezone.utc)
