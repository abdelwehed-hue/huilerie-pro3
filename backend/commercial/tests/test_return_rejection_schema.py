import pytest
from pydantic import ValidationError

from commercial.schemas.return_rejection import RejectSaleReturnCommand


def _valid_payload():
    return {
        "rejection_date": "2026-11-02",
        "expected_return_version": 1,
        "reason": "Packaging did not meet the agreed return conditions",
        "buyer_receipt_reference": "BUYER-ACK-RETURN-001",
        "idempotency_key": "return-rejection-schema-key-001",
    }


def test_return_rejection_command_accepts_complete_audited_request():
    command = RejectSaleReturnCommand(**_valid_payload())
    assert command.expected_return_version == 1
    assert command.rejection_date.isoformat() == "2026-11-02"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("reason", "bad"),
        ("buyer_receipt_reference", "x"),
        ("idempotency_key", "short"),
        ("expected_return_version", 0),
    ],
)
def test_return_rejection_command_rejects_missing_or_weak_evidence(field, value):
    payload = _valid_payload()
    payload[field] = value
    with pytest.raises(ValidationError):
        RejectSaleReturnCommand(**payload)


def test_return_rejection_command_rejects_unexpected_fields():
    payload = _valid_payload()
    payload["refund_amount_dt"] = "10.000"
    with pytest.raises(ValidationError):
        RejectSaleReturnCommand(**payload)
