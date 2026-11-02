import pytest
from pydantic import ValidationError

from commercial.schemas.buyers import CommercialBuyerDraft
from commercial.schemas.sales import (
    ApproveWholesaleSaleCommand, SalePaymentDraft, WholesaleSaleDraft,
)


def test_buyer_name_is_trimmed_and_empty_optional_fields_are_allowed():
    buyer = CommercialBuyerDraft(name="  Buyer   Company  ", phone="+216 70 000 000")
    assert buyer.name == "Buyer Company"
    assert buyer.tax_identifier is None


def test_wholesale_sale_requires_positive_kg_and_price():
    sale = WholesaleSaleDraft(
        sale_date="2026-11-02", buyer_id="buyer-1", oil_lot_id="oil-1",
        source_tank_id="tank-01", quantity_kg="250.000",
        unit_price_dt="4.500", idempotency_key="wholesale-sale-key-001",
    )
    assert sale.quantity_kg == 250
    assert sale.unit_price_dt == 4.5
    with pytest.raises(ValidationError):
        WholesaleSaleDraft(
            sale_date="2026-11-02", buyer_id="buyer-1", oil_lot_id="oil-1",
            source_tank_id="tank-01", quantity_kg="0",
            unit_price_dt="4.500", idempotency_key="wholesale-sale-key-002",
        )


def test_sale_approval_requires_expected_version_and_idempotency():
    command = ApproveWholesaleSaleCommand(
        expected_version=1, idempotency_key="sale-approval-key-001"
    )
    assert command.expected_version == 1
    with pytest.raises(ValidationError):
        ApproveWholesaleSaleCommand(expected_version=0, idempotency_key="sale-approval-key-002")


def test_payment_requires_positive_amount_and_supported_method():
    payment = SalePaymentDraft(
        payment_date="2026-11-02", amount_dt="100.000", method="BANK_TRANSFER", reference="TRX-001",
        expected_invoice_version=1, idempotency_key="sale-payment-key-001",
    )
    assert payment.amount_dt == 100
    with pytest.raises(ValidationError):
        SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="-1", method="CASH",
            expected_invoice_version=1, idempotency_key="sale-payment-key-002",
        )
    with pytest.raises(ValidationError):
        SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="10", method="UNKNOWN",
            expected_invoice_version=1, idempotency_key="sale-payment-key-003",
        )

def test_bank_and_cheque_payments_require_reference():
    with pytest.raises(ValidationError, match="reference is required"):
        SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="10.000", method="BANK_TRANSFER",
            expected_invoice_version=1, idempotency_key="sale-payment-no-ref-001",
        )
    with pytest.raises(ValidationError, match="reference is required"):
        SalePaymentDraft(
            payment_date="2026-11-02", amount_dt="10.000", method="CHEQUE",
            expected_invoice_version=1, idempotency_key="sale-payment-no-ref-002",
        )
