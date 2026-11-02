import pytest
from pydantic import ValidationError

from commercial.schemas.customer_custody import (
    CustomerOliveCustodyReceiptDraft,
    CustomerOilCustodyReleaseDraft,
)


def test_customer_olive_custody_receipt_requires_acknowledged_customer_and_positive_quantity():
    draft = CustomerOliveCustodyReceiptDraft(
        customer_phone="+21612345678",
        receipt_date="2026-11-02",
        variety_id="chemlali",
        quantity_kg="1250.500",
        receiving_location_id="olive-yard-01",
        customer_acknowledgement_reference="ACK-RECEIPT-001",
        idempotency_key="customer-custody-receipt-001",
    )
    assert draft.quantity_kg == 1250.500
    assert draft.customer_phone == "+21612345678"


@pytest.mark.parametrize("phone", ["", "abc12345", "+216 12 345 678", "123"])
def test_customer_custody_rejects_invalid_phone(phone):
    with pytest.raises(ValidationError):
        CustomerOliveCustodyReceiptDraft(
            customer_phone=phone,
            receipt_date="2026-11-02",
            variety_id="chemlali",
            quantity_kg="100",
            receiving_location_id="olive-yard-01",
            customer_acknowledgement_reference="ACK-001",
            idempotency_key="customer-custody-receipt-002",
        )


def test_customer_oil_release_requires_acknowledgement_and_positive_quantity():
    draft = CustomerOilCustodyReleaseDraft(
        customer_id="custody-owner-a",
        release_date="2026-11-02",
        oil_lot_id="customer-oil-lot-01",
        source_tank_id="tank-01",
        quantity_kg="25.000",
        customer_acknowledgement_reference="ACK-PICKUP-001",
        reason="Customer collected released oil",
        idempotency_key="customer-oil-pickup-001",
    )
    assert draft.quantity_kg == 25
    assert draft.oil_lot_id == "customer-oil-lot-01"


def test_customer_oil_release_rejects_missing_acknowledgement():
    with pytest.raises(ValidationError):
        CustomerOilCustodyReleaseDraft(
            customer_id="custody-owner-a",
            release_date="2026-11-02",
            oil_lot_id="customer-oil-lot-01",
            source_tank_id="tank-01",
            quantity_kg="25.000",
            customer_acknowledgement_reference="",
            reason="Customer collected released oil",
            idempotency_key="customer-oil-pickup-002",
        )
