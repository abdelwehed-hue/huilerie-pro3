import pytest
from pydantic import ValidationError

from commercial.schemas.credit_application import BuyerCreditApplicationDraft


def test_credit_application_accepts_positive_three_decimal_amount_and_version():
    draft = BuyerCreditApplicationDraft(
        amount_dt="60.125",
        expected_invoice_version=3,
        reason="Apply approved buyer credit",
        idempotency_key="buyer-credit-application-0001",
    )
    assert str(draft.amount_dt) == "60.125"
    assert draft.expected_invoice_version == 3


@pytest.mark.parametrize("amount", ["0", "-1", "1.0001"])
def test_credit_application_rejects_zero_negative_or_excess_precision(amount):
    with pytest.raises(ValidationError):
        BuyerCreditApplicationDraft(
            amount_dt=amount,
            expected_invoice_version=1,
            reason="Apply approved buyer credit",
            idempotency_key="buyer-credit-application-0002",
        )


def test_credit_application_rejects_short_reason_and_missing_version():
    with pytest.raises(ValidationError):
        BuyerCreditApplicationDraft(
            amount_dt="10.000",
            expected_invoice_version=1,
            reason="bad",
            idempotency_key="buyer-credit-application-0003",
        )
