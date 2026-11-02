import pytest
from pydantic import ValidationError

from commercial.schemas.payment_reversal import PaymentReversalDraft


def test_payment_reversal_requires_reason_amount_and_invoice_version():
    draft = PaymentReversalDraft(
        reversal_date="2026-11-02",
        amount_dt="25.125",
        expected_invoice_version=4,
        reason="Correct a duplicated payment entry",
        idempotency_key="payment-reversal-schema-0001",
    )
    assert str(draft.amount_dt) == "25.125"
    assert draft.expected_invoice_version == 4


@pytest.mark.parametrize("amount", ["0", "-1", "1.0001"])
def test_payment_reversal_rejects_invalid_amount(amount):
    with pytest.raises(ValidationError):
        PaymentReversalDraft(
            reversal_date="2026-11-02",
            amount_dt=amount,
            expected_invoice_version=1,
            reason="Correct a duplicated payment entry",
            idempotency_key="payment-reversal-schema-0002",
        )


def test_payment_reversal_rejects_short_reason():
    with pytest.raises(ValidationError):
        PaymentReversalDraft(
            amount_dt="10.000",
            expected_invoice_version=1,
            reason="bad",
            idempotency_key="payment-reversal-schema-0003",
        )
