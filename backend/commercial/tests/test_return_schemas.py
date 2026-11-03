from decimal import Decimal

import pytest
from pydantic import ValidationError

from commercial.schemas.returns import SaleReturnDraft


def test_sale_return_requires_version_reason_and_idempotency():
    draft = SaleReturnDraft(
        expected_sale_version=2, quantity_kg="12.345",
        quarantine_tank_id="tank-09", reason="Buyer returned sealed oil",
        idempotency_key="return-schema-idempotency-001",
    )
    assert draft.quantity_kg == Decimal("12.345")
    assert draft.expected_sale_version == 2


@pytest.mark.parametrize("quantity", ["0", "-1", "1.0001"])
def test_sale_return_rejects_nonpositive_or_excess_precision(quantity):
    with pytest.raises(ValidationError):
        SaleReturnDraft(
            expected_sale_version=2, quantity_kg=quantity,
            quarantine_tank_id="tank-09", reason="Buyer returned sealed oil",
            idempotency_key="return-schema-idempotency-002",
        )


def test_sale_return_rejects_legacy_or_draft_sale_versions():
    with pytest.raises(ValidationError):
        SaleReturnDraft(
            expected_sale_version=1, quantity_kg="1.000",
            quarantine_tank_id="tank-09", reason="Buyer returned sealed oil",
            idempotency_key="return-schema-idempotency-003",
        )


def test_sale_return_forbids_unrecognized_fields():
    with pytest.raises(ValidationError):
        SaleReturnDraft(
            expected_sale_version=2, quantity_kg="1.000",
            quarantine_tank_id="tank-09", reason="Buyer returned sealed oil",
            idempotency_key="return-schema-idempotency-004",
            amount_dt="9999.000",
        )
