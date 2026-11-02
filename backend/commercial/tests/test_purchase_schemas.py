from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from commercial.schemas.purchases import OlivePurchaseDraft


def test_olive_purchase_accepts_multiple_varieties_and_decimal_values():
    draft = OlivePurchaseDraft(
        supplier_id="supplier-1",
        purchase_date=date(2026, 11, 2),
        lines=[
            {"variety_id": "chemlali", "quantity_kg": "1250.500", "unit_price_dt": "1.250"},
            {"variety_id": "chetoui", "quantity_kg": "500", "unit_price_dt": "1.400"},
        ],
        idempotency_key="purchase-request-0001",
    )
    assert draft.lines[0].quantity_kg == Decimal("1250.500")
    assert len(draft.lines) == 2


def test_olive_purchase_rejects_client_supplied_total():
    with pytest.raises(ValidationError):
        OlivePurchaseDraft(
            supplier_id="supplier-1",
            purchase_date=date(2026, 11, 2),
            lines=[{"variety_id": "chemlali", "quantity_kg": "100", "unit_price_dt": "1.200"}],
            total_dt="120.000",
            idempotency_key="purchase-request-0002",
        )


def test_olive_purchase_rejects_zero_or_negative_quantity():
    with pytest.raises(ValidationError):
        OlivePurchaseDraft(
            supplier_id="supplier-1",
            purchase_date=date(2026, 11, 2),
            lines=[{"variety_id": "chemlali", "quantity_kg": "0", "unit_price_dt": "1.200"}],
            idempotency_key="purchase-request-0003",
        )


def test_olive_purchase_rejects_excess_decimal_precision():
    with pytest.raises(ValidationError):
        OlivePurchaseDraft(
            supplier_id="supplier-1",
            purchase_date=date(2026, 11, 2),
            lines=[{"variety_id": "chemlali", "quantity_kg": "10.1234", "unit_price_dt": "1.200"}],
            idempotency_key="purchase-request-0004",
        )
