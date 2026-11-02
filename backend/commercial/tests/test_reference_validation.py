import pytest

from commercial.services.reference_validation import (
    SOURCE_DOCUMENT_COLLECTIONS,
    validate_stock_references,
)


class Collection:
    def __init__(self, rows=None):
        self.rows = rows or []

    async def find_one(self, query, projection=None, session=None):
        return next((row for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)


class Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.get(name, Collection())


class Owner:
    def __init__(self, kind, customer_id=None):
        self.kind = kind
        self.customer_id = customer_id


class Draft:
    lot_id = "lot-1"
    product_kind = "OIL"
    source_location_id = None
    destination_location_id = "tank-01"
    source_owner = None
    destination_owner = Owner("MILL")
    source_document_type = "UNKNOWN"
    source_document_id = "purchase-1"


@pytest.mark.asyncio
async def test_unknown_lot_is_rejected():
    db = Database({"commercial_lots": Collection(), "commercial_tanks": Collection([{"id": "tank-01", "active": True}])})
    with pytest.raises(ValueError, match="Unknown commercial lot"):
        await validate_stock_references(db, Draft(), session=object())


@pytest.mark.asyncio
async def test_unregistered_source_document_type_is_rejected_closed():
    assert SOURCE_DOCUMENT_COLLECTIONS == {"ACH": "commercial_olive_purchases"}
    db = Database({
        "commercial_lots": Collection([{"id": "lot-1"}]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": True}]),
    })
    with pytest.raises(ValueError, match="Unsupported source document type"):
        await validate_stock_references(db, Draft(), session=object())


@pytest.mark.asyncio
async def test_inactive_tank_is_rejected():
    db = Database({
        "commercial_lots": Collection([{"id": "lot-1"}]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": False}]),
    })
    with pytest.raises(ValueError, match="Unknown or inactive commercial tank"):
        await validate_stock_references(db, Draft(), session=object())
