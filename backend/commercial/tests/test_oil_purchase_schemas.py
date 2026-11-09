from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from commercial.schemas.oil_purchases import OilPurchasePaymentDraft


def base(**overrides):
    values = {
        "payment_date": date(2026, 11, 8),
        "amount_tnd": Decimal("25.000"),
        "method": "CASH",
        "expected_purchase_version": 1,
        "idempotency_key": "oil-purchase-payment-key-001",
    }
    values.update(overrides)
    return values


def test_cash_payment_does_not_require_reference():
    draft = OilPurchasePaymentDraft(**base())
    assert draft.amount_tnd == Decimal("25.000")
    assert draft.reference is None


@pytest.mark.parametrize("method", ["BANK_TRANSFER", "CHEQUE"])
def test_non_cash_payment_requires_reference(method):
    with pytest.raises(ValidationError, match="reference is required"):
        OilPurchasePaymentDraft(**base(method=method))
    draft = OilPurchasePaymentDraft(**base(method=method, reference="PAYMENT-REF-001"))
    assert draft.reference == "PAYMENT-REF-001"


def test_payment_amount_must_be_positive():
    with pytest.raises(ValidationError):
        OilPurchasePaymentDraft(**base(amount_tnd=Decimal("0.000")))
