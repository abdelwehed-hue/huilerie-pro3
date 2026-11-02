import pytest
from pydantic import ValidationError

from commercial.schemas.inventory import OwnerRef, StockMovementDraft


MILL = OwnerRef(kind="MILL")
CUSTOMER = OwnerRef(kind="CUSTOMER", customer_id="farmer-17")


def draft(**overrides):
    data = {
        "movement_kind": "TRANSFER",
        "product_kind": "OIL",
        "lot_id": "lot-1",
        "quantity_kg": "125.500",
        "source_location_id": "tank-1",
        "destination_location_id": "tank-2",
        "source_owner": MILL,
        "destination_owner": MILL,
        "source_document_type": "TRF",
        "source_document_id": "2627TRF0001",
        "idempotency_key": "transfer-request-0001",
        "reason": "Transfer to settling tank",
    }
    data.update(overrides)
    return StockMovementDraft(**data)


def test_transfer_preserves_owner_and_decimal_quantity():
    movement = draft()
    assert movement.quantity_kg.as_tuple().exponent == -3
    assert movement.source_owner == movement.destination_owner


def test_customer_owner_requires_customer_id():
    with pytest.raises(ValidationError):
        OwnerRef(kind="CUSTOMER")


def test_mill_owner_rejects_customer_id():
    with pytest.raises(ValidationError):
        OwnerRef(kind="MILL", customer_id="farmer-17")


def test_transfer_cannot_change_owner():
    with pytest.raises(ValidationError, match="Invalid location/owner"):
        draft(source_owner=MILL, destination_owner=CUSTOMER)


def test_ownership_transfer_must_keep_same_location():
    with pytest.raises(ValidationError, match="Invalid location/owner"):
        draft(
            movement_kind="OWNERSHIP_TRANSFER",
            source_owner=MILL,
            destination_owner=CUSTOMER,
        )


def test_ownership_transfer_changes_owner_at_same_location():
    movement = draft(
        movement_kind="OWNERSHIP_TRANSFER",
        source_location_id="tank-1",
        destination_location_id="tank-1",
        source_owner=MILL,
        destination_owner=CUSTOMER,
    )
    assert movement.source_owner != movement.destination_owner


def test_dispatch_requires_source_only():
    movement = draft(
        movement_kind="DISPATCH",
        destination_location_id=None,
        destination_owner=None,
    )
    assert movement.destination_location_id is None


@pytest.mark.parametrize("quantity", ["0", "-1", "1.2345"])
def test_quantity_must_be_positive_and_at_most_three_decimals(quantity):
    with pytest.raises(ValidationError):
        draft(quantity_kg=quantity)


def test_unknown_fields_are_rejected():
    with pytest.raises(ValidationError):
        draft(available_balance=1000)


def test_olive_location_schema_accepts_storage_and_staging_only():
    from commercial.schemas.inventory import CommercialLocationDraft

    storage = CommercialLocationDraft(code="OLV-A", name="Olive warehouse", kind="OLIVE_STORAGE")
    staging = CommercialLocationDraft(code="STG-A", name="Reception staging", kind="STAGING")
    assert storage.kind == "OLIVE_STORAGE"
    assert staging.kind == "STAGING"


def test_olive_location_schema_rejects_oil_tank_kind():
    from commercial.schemas.inventory import CommercialLocationDraft

    with pytest.raises(ValidationError):
        CommercialLocationDraft(code="T01", name="Oil tank", kind="OIL_TANK")
