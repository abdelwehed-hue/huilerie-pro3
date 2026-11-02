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
