from decimal import Decimal

import pytest

from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.services.reference_validation import validate_stock_references


class FakeCollection:
    def __init__(self, find_one_rows=()):
        self.find_one_rows = list(find_one_rows)
        self.updates = 0

    async def find_one(self, query, projection=None, session=None):
        if not self.find_one_rows:
            return None
        return self.find_one_rows.pop(0)

    async def update_one(self, query, update, session=None):
        self.updates += 1
        return type("Result", (), {"matched_count": 1})()


class FakeDatabase:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections[name]


def sale_movement(quantity):
    return StockMovementDraft(
        movement_kind="DISPATCH",
        product_kind="OIL",
        lot_id="oil-lot-1",
        quantity_kg=Decimal(quantity),
        source_location_id="tank-1",
        source_owner=OwnerRef(kind="MILL"),
        source_document_type="VTE",
        source_document_id="sale-1",
        idempotency_key="sale-dispatch-validation-001",
        reason="Validate sale dispatch reference",
    )


def fake_sale_db():
    return FakeDatabase({
        "commercial_lots": FakeCollection([{"id": "oil-lot-1", "product_kind": "OIL"}]),
        "commercial_tanks": FakeCollection([{"id": "tank-1", "role": "NORMAL"}]),
        "commercial_sales": FakeCollection([{
            "id": "sale-1",
            "status": "APPROVED",
            "oil_lot_id": "oil-lot-1",
            "source_tank_id": "tank-1",
            "quantity_kg": Decimal("25.000"),
        }]),
    })


@pytest.mark.asyncio
async def test_sale_dispatch_rejects_quantity_different_from_approved_sale():
    db = fake_sale_db()
    with pytest.raises(ValueError, match="does not match its approved sale"):
        await validate_stock_references(db, sale_movement("24.000"), session=object())


@pytest.mark.asyncio
async def test_sale_dispatch_accepts_exact_approved_sale_reference():
    db = fake_sale_db()
    await validate_stock_references(db, sale_movement("25.000"), session=object())
    assert db["commercial_tanks"].updates == 1


def return_receipt_movement(quantity):
    return StockMovementDraft(
        movement_kind="RECEIPT",
        product_kind="OIL",
        lot_id="returned-lot-1",
        quantity_kg=Decimal(quantity),
        destination_location_id="quarantine-1",
        destination_owner=OwnerRef(kind="MILL"),
        source_document_type="RET",
        source_document_id="return-1",
        idempotency_key="return-receipt-validation-001",
        reason="Validate returned oil receipt",
    )


@pytest.mark.asyncio
async def test_return_receipt_rejects_quantity_different_from_return_and_lot():
    db = FakeDatabase({
        "commercial_lots": FakeCollection([
            {"id": "returned-lot-1", "product_kind": "OIL"},
            {"quantity_received_kg": Decimal("10.000"), "owner": {"kind": "MILL"}},
        ]),
        "commercial_tanks": FakeCollection([
            {"id": "quarantine-1", "role": "QUARANTINE"},
        ]),
        "commercial_sale_returns": FakeCollection([{
            "id": "return-1", "status": "RECEIVED",
            "returned_oil_lot_id": "returned-lot-1",
            "quarantine_tank_id": "quarantine-1",
            "quantity_kg": Decimal("10.000"),
        }]),
    })
    with pytest.raises(ValueError, match="Return receipt does not match"):
        await validate_stock_references(db, return_receipt_movement("9.000"), session=object())


def customer_release_movement(quantity):
    return StockMovementDraft(
        movement_kind="DISPATCH",
        product_kind="OIL",
        lot_id="customer-oil-lot",
        quantity_kg=Decimal(quantity),
        source_location_id="tank-1",
        source_owner=OwnerRef(kind="CUSTOMER", customer_id="cust-1"),
        source_document_type="CUS",
        source_document_id="release-1",
        idempotency_key="customer-release-validation-001",
        reason="Validate customer oil release",
    )


@pytest.mark.asyncio
async def test_customer_oil_release_rejects_quantity_different_from_release_document():
    db = FakeDatabase({
        "commercial_lots": FakeCollection([{"id": "customer-oil-lot", "product_kind": "OIL"}]),
        "commercial_tanks": FakeCollection([{"id": "tank-1", "role": "NORMAL"}]),
        "commercial_custody_owners": FakeCollection([{"id": "cust-1"}]),
        "commercial_customer_custody_releases": FakeCollection([{
            "id": "release-1", "status": "APPROVED",
            "oil_lot_id": "customer-oil-lot", "customer_id": "cust-1",
            "source_tank_id": "tank-1", "quantity_kg": Decimal("15.000"),
        }]),
    })
    with pytest.raises(ValueError, match="Customer oil custody release does not match"):
        await validate_stock_references(db, customer_release_movement("14.000"), session=object())
