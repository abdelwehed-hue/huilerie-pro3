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
        consent_method="DOCUMENT",
        consent_reference="CONSENT-001",
        consideration_type="GIFT",
    ))
    assert draft.destination_owner.kind == "CUSTOMER"


def test_ownership_transfer_rejects_different_locations():
    with pytest.raises(ValidationError, match="Invalid locations or owners"):
        InternalMovementDraft(**base(
            movement_kind="OWNERSHIP_TRANSFER",
            destination_owner={"kind": "CUSTOMER", "customer_id": "c-1"},
        ))


def test_ownership_transfer_rejects_customer_to_customer_reassignment():
    with pytest.raises(ValidationError, match="Invalid locations or owners"):
        InternalMovementDraft(**base(
            movement_kind="OWNERSHIP_TRANSFER",
            destination_location_id="olive-a",
            source_owner={"kind": "CUSTOMER", "customer_id": "c-1"},
            destination_owner={"kind": "CUSTOMER", "customer_id": "c-2"},
        ))


def test_external_receipt_or_dispatch_cannot_be_submitted_as_internal_movement():
    with pytest.raises(ValidationError):
        InternalMovementDraft(**base(movement_kind="DISPATCH"))


@pytest.mark.asyncio
async def test_generic_stock_endpoint_rejects_internal_document_source(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017/test")
    monkeypatch.setenv("DB_NAME", "commercial_route_unit_test")
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret-not-for-production")
    from fastapi import HTTPException
    from commercial.routers import create_stock_movement
    from commercial.schemas.inventory import StockMovementDraft

    draft = StockMovementDraft(
        movement_kind="DISPATCH",
        product_kind="OIL",
        lot_id="oil-lot-1",
        quantity_kg="10.000",
        source_location_id="tank-01",
        source_owner={"kind": "MILL"},
        source_document_type="INT",
        source_document_id="internal-doc-1",
        idempotency_key="generic-int-reject-key-001",
        reason="Attempt to bypass internal movement workflow",
    )
    with pytest.raises(HTTPException) as error:
        await create_stock_movement(
            draft, {"active": True, "role": "admin", "id": "admin-1"}
        )
    assert error.value.status_code == 422
    assert "owning_purchase_production_internal_or_sales_workflow" in error.value.detail



def ownership_sale(**overrides):
    values = base(
        movement_kind="OWNERSHIP_TRANSFER",
        product_kind="OIL",
        source_location_id="tank-01",
        destination_location_id="tank-01",
        source_owner={"kind": "CUSTOMER", "customer_id": "customer-1"},
        destination_owner={"kind": "MILL"},
        consent_method="DOCUMENT",
        consent_reference="CONSENT-002",
        consideration_type="SALE",
        consideration_amount="150.000",
    )
    values.update(overrides)
    return values


def test_customer_oil_sale_accepts_partial_initial_payment():
    draft = InternalMovementDraft(**ownership_sale(
        initial_payment_amount="50.000",
        initial_payment_method="CASH",
        initial_payment_date="2026-11-08",
    ))
    assert draft.initial_payment_amount == 50


def test_customer_oil_sale_accepts_full_payment_or_credit_without_payment_fields():
    paid = InternalMovementDraft(**ownership_sale(
        initial_payment_amount="150.000",
        initial_payment_method="BANK_TRANSFER",
        initial_payment_reference="BANK-REF-001",
    ))
    credit = InternalMovementDraft(**ownership_sale())
    assert paid.initial_payment_amount == 150
    assert credit.initial_payment_amount is None


def test_customer_oil_sale_rejects_initial_payment_above_agreed_amount():
    with pytest.raises(ValidationError, match="cannot exceed"):
        InternalMovementDraft(**ownership_sale(
            initial_payment_amount="150.001",
            initial_payment_method="CASH",
        ))


def test_customer_oil_sale_requires_method_and_non_cash_reference():
    with pytest.raises(ValidationError, match="Payment method is required"):
        InternalMovementDraft(**ownership_sale(initial_payment_amount="10.000"))
    with pytest.raises(ValidationError, match="reference is required"):
        InternalMovementDraft(**ownership_sale(
            initial_payment_amount="10.000",
            initial_payment_method="CHEQUE",
        ))


def test_gift_transfer_rejects_payment_and_customer_sale_supports_olives_and_oil():
    with pytest.raises(ValidationError, match="gift transfer cannot include payment"):
        InternalMovementDraft(**base(
            movement_kind="OWNERSHIP_TRANSFER",
            product_kind="OIL",
            source_location_id="tank-01",
            destination_location_id="tank-01",
            source_owner={"kind": "CUSTOMER", "customer_id": "customer-1"},
            destination_owner={"kind": "MILL"},
            consent_method="DOCUMENT",
            consent_reference="CONSENT-003",
            consideration_type="GIFT",
            initial_payment_amount="1.000",
            initial_payment_method="CASH",
        ))
    olive_sale = InternalMovementDraft(**ownership_sale(product_kind="OLIVE", consideration_amount="250.000"))
    assert olive_sale.product_kind == "OLIVE"
    assert olive_sale.consideration_amount == 250


def test_customer_sale_rejects_non_customer_to_mill_ownership():
    with pytest.raises(ValidationError, match="customer-to-mill ownership"):
        InternalMovementDraft(**ownership_sale(source_owner={"kind": "MILL"}, destination_owner={"kind": "CUSTOMER", "customer_id": "customer-2"}))
