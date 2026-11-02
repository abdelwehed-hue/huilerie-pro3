import pytest

from commercial.inventory_bootstrap import provision_commercial_counters


class CounterCollection:
    def __init__(self):
        self.rows = {}

    async def create_indexes(self, indexes):
        return None

    async def update_one(self, query, update, upsert=False):
        key = (query["season_code"], query["document_type"])
        if key not in self.rows and upsert:
            self.rows[key] = dict(update["$setOnInsert"])
        elif key in self.rows:
            # Mimic $setOnInsert: an existing counter must never be reset.
            pass


class Database:
    def __init__(self):
        self.collection = CounterCollection()

    def __getitem__(self, name):
        assert name == "commercial_counters"
        return self.collection


@pytest.mark.asyncio
async def test_counter_bootstrap_initializes_each_document_type_once():
    db = Database()
    count = await provision_commercial_counters(db, "2627", ("LOT", "MVT", "FAC"))
    assert count == 3
    assert db.collection.rows[("2627", "LOT")]["last_sequence"] == 0
    assert db.collection.rows[("2627", "MVT")]["last_sequence"] == 0
    assert db.collection.rows[("2627", "FAC")]["last_sequence"] == 0


@pytest.mark.asyncio
async def test_counter_bootstrap_never_resets_existing_counter():
    db = Database()
    await provision_commercial_counters(db, "2627", ("MVT",))
    db.collection.rows[("2627", "MVT")]["last_sequence"] = 41
    await provision_commercial_counters(db, "2627", ("MVT",))
    assert db.collection.rows[("2627", "MVT")]["last_sequence"] == 41


@pytest.mark.asyncio
async def test_counter_bootstrap_rejects_invalid_season():
    with pytest.raises(ValueError, match="season_code"):
        await provision_commercial_counters(Database(), "2026")


