import pytest
from pydantic import ValidationError

from commercial.schemas.internal_movements import InternalMovementDraft


def base(**overrides):
    values = {
        "movement_kind": "TRANSFER",
        "product_kind": "OLIVE",
        "lot_id": "lot-1",
        "quantity_kg": "125.500",
        "source_location_id": "olive-a",
        "destination_location_id": "olive-b",
        "source_owner": {"kind": "MILL"},
        "destination_owner": {"kind": "MILL"},
        "idempotency_key": "internal-movement-key-01",
        "reason": "Reorganize olive storage",
    }
    values.update(overrides)
    return values


def test_internal_transfer_requires_distinct_locations_and_same_owner():
    draft = InternalMovementDraft(**base())
    assert draft.movement_kind == "TRANSFER"
    assert draft.quantity_kg == 125.500


def test_internal_transfer_rejects_owner_change():
    with pytest.raises(ValidationError, match="Invalid locations or owners"):
        InternalMovementDraft(**base(destination_owner={"kind": "CUSTOMER", "customer_id": "c-1"}))


def test_ownership_transfer_requires_same_location_and_different_owner():
    draft = InternalMovementDraft(**base(
        movement_kind="OWNERSHIP_TRANSFER",
        destination_location_id="olive-a",
        destination_owner={"kind": "CUSTOMER", "customer_id": "c-1"},
    ))
    assert draft.destination_owner.kind == "CUSTOMER"


def test_ownership_transfer_rejects_different_locations():
    with pytest.raises(ValidationError, match="Invalid locations or owners"):
        InternalMovementDraft(**base(
            movement_kind="OWNERSHIP_TRANSFER",
            destination_owner={"kind": "CUSTOMER", "customer_id": "c-1"},
        ))


def test_external_receipt_or_dispatch_cannot_be_submitted_as_internal_movement():
    with pytest.raises(ValidationError):
        InternalMovementDraft(**base(movement_kind="DISPATCH"))
