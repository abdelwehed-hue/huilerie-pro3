import pytest

from commercial.inventory_bootstrap import TANKS, provision_nine_tanks


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row[key])
        return self

    async def to_list(self, length):
        return self.rows[:length]


class Collection:
    def __init__(self):
        self.rows = {}

    async def create_indexes(self, indexes):
        return None

    async def update_one(self, query, update, upsert=False):
        key = query["id"]
        if key not in self.rows and upsert:
            self.rows[key] = dict(update["$setOnInsert"])

    def find(self, query, projection):
        ids = query["id"]["$in"]
        return Cursor([dict(self.rows[key]) for key in ids if key in self.rows])


class Database:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        self.collections.setdefault(name, Collection())
        return self.collections[name]


@pytest.mark.asyncio
async def test_provision_nine_empty_tanks():
    db = Database()
    rows = await provision_nine_tanks(db)
    assert len(rows) == 9
    assert len(TANKS) == 9
    assert all(row["capacity_kg"] is None for row in rows)
    assert all(row["role"] == "NORMAL" and row["version"] == 1 for row in rows)
    assert all("opening_balance_kg" not in row for row in rows)


@pytest.mark.asyncio
async def test_provision_is_idempotent_and_preserves_existing_name():
    db = Database()
    await provision_nine_tanks(db)
    db["commercial_tanks"].rows["tank-01"]["name"] = "Cuve principale"
    rows = await provision_nine_tanks(db)
    assert len(rows) == 9
    assert rows[0]["name"] == "Cuve principale"
    assert len(db["commercial_tanks"].rows) == 9


def test_preproduction_sample_collection_has_unique_id_document_and_idempotency_indexes():
    from commercial.inventory_bootstrap import INVENTORY_INDEXES

    indexes = INVENTORY_INDEXES["commercial_preproduction_samples"]
    names = {index.document["name"] for index in indexes}
    assert names == {
        "uq_preproduction_sample_id",
        "uq_preproduction_sample_document",
        "uq_preproduction_sample_idempotency",
        "preproduction_sample_source_created",
    }
    assert all(index.document.get("unique") for index in indexes[:3])


def test_production_collection_has_unique_id_document_and_idempotency_indexes():
    from commercial.inventory_bootstrap import INVENTORY_INDEXES

    indexes = INVENTORY_INDEXES["commercial_production_runs"]
    names = {index.document["name"] for index in indexes}
    assert names == {
        "uq_commercial_production_id",
        "uq_commercial_production_document",
        "uq_commercial_production_idempotency",
        "commercial_production_date",
    }
    assert all(index.document.get("unique") for index in indexes[:3])


@pytest.mark.asyncio
async def test_default_counter_bootstrap_creates_every_document_type_once():
    from commercial.inventory_bootstrap import (
        COMMERCIAL_DOCUMENT_TYPES,
        provision_commercial_counters,
    )

    class CounterCollection:
        def __init__(self):
            self.rows = {}

        async def create_indexes(self, indexes):
            return None

        async def update_one(self, query, update, upsert=False):
            key = (query["season_code"], query["document_type"])
            if key not in self.rows and upsert:
                self.rows[key] = dict(update["$setOnInsert"])

    class CounterDatabase:
        def __init__(self):
            self.counters = CounterCollection()

        def __getitem__(self, name):
            assert name == "commercial_counters"
            return self.counters

    db = CounterDatabase()
    created = await provision_commercial_counters(db, "2627")

    expected = {"LOT", "MVT", "ACH", "PROD", "VTE", "FAC", "PAY", "INT", "RET", "AVO", "CIN", "CUS", "CAP", "REV", "RJT", "ESS"}
    assert set(COMMERCIAL_DOCUMENT_TYPES) == expected
    assert len(COMMERCIAL_DOCUMENT_TYPES) == len(expected)
    assert created == len(expected)
    assert {document_type for _, document_type in db.counters.rows} == expected
    assert all(row["last_sequence"] == 0 for row in db.counters.rows.values())


@pytest.mark.asyncio
async def test_counter_bootstrap_rejects_duplicate_or_unregistered_document_types():
    from commercial.inventory_bootstrap import provision_commercial_counters

    class CounterCollection:
        async def create_indexes(self, indexes):
            return None

    class CounterDatabase:
        def __getitem__(self, name):
            return CounterCollection()

    db = CounterDatabase()
    with pytest.raises(ValueError, match="unique"):
        await provision_commercial_counters(db, "2627", ("LOT", "LOT"))
    with pytest.raises(ValueError, match="Unsupported"):
        await provision_commercial_counters(db, "2627", ("2026",))
