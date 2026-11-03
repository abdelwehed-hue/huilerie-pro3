import pytest
from pydantic import ValidationError

from commercial.schemas.return_acceptance import AcceptSaleReturnCommand


def test_accept_return_command_requires_version_reason_and_idempotency():
    command = AcceptSaleReturnCommand(
        expected_return_version=1,
        reason="Return accepted by commercial manager",
        idempotency_key="accept-return-schema-key-001",
    )
    assert command.expected_return_version == 1


@pytest.mark.parametrize("version", [0, -1])
def test_accept_return_command_rejects_invalid_version(version):
    with pytest.raises(ValidationError):
        AcceptSaleReturnCommand(
            expected_return_version=version,
            reason="Return accepted by commercial manager",
            idempotency_key="accept-return-schema-key-002",
        )


def test_accept_return_command_rejects_short_reason_and_extra_amount():
    with pytest.raises(ValidationError):
        AcceptSaleReturnCommand(
            expected_return_version=1, reason="No",
            idempotency_key="accept-return-schema-key-003",
        )
    with pytest.raises(ValidationError):
        AcceptSaleReturnCommand(
            expected_return_version=1,
            reason="Return accepted by commercial manager",
            idempotency_key="accept-return-schema-key-004",
            amount_dt="9999.000",
        )
