from decimal import Decimal

import pytest
from pydantic import ValidationError

from commercial.schemas.production import CommercialProductionDraft


def _input(lot_id, owner_kind="MILL", customer_id=None):
    owner = {"kind": owner_kind}
    if customer_id is not None:
        owner["customer_id"] = customer_id
    return {
        "olive_lot_id": lot_id,
        "source_location_id": "olive-yard-01",
        "owner": owner,
        "quantity_kg": "1000.000",
    }


def test_production_calculates_actual_extraction_without_assumed_rate():
    draft = CommercialProductionDraft(
        production_date="2026-11-02",
        inputs=[_input("olive-lot-1")],
        actual_oil_output_kg="180.500",
        output_tank_id="tank-01",
        idempotency_key="production-run-0001",
    )
    assert draft.total_olive_input_kg == Decimal("1000.000")
    assert draft.extraction_rate_percent == Decimal("18.05000")
    assert draft.owner.kind == "MILL"


def test_production_rejects_mixing_mill_and_customer_custody_olives():
    with pytest.raises(ValidationError, match="exactly one olive batch"):
        CommercialProductionDraft(
            production_date="2026-11-02",
            inputs=[
                _input("olive-lot-1", "MILL"),
                _input("olive-lot-2", "CUSTOMER", "client-42"),
            ],
            actual_oil_output_kg="180",
            output_tank_id="tank-01",
            idempotency_key="production-run-0002",
        )


def test_production_rejects_output_mass_above_input_mass():
    with pytest.raises(ValidationError, match="cannot exceed"):
        CommercialProductionDraft(
            production_date="2026-11-02",
            inputs=[_input("olive-lot-1")],
            actual_oil_output_kg="1000.001",
            output_tank_id="tank-01",
            idempotency_key="production-run-0003",
        )


def test_customer_owned_production_preserves_customer_owner():
    draft = CommercialProductionDraft(
        production_date="2026-11-02",
        inputs=[_input("olive-lot-1", "CUSTOMER", "client-42")],
        actual_oil_output_kg="175",
        output_tank_id="tank-02",
        idempotency_key="production-run-0004",
    )
    assert draft.owner.kind == "CUSTOMER"
    assert draft.owner.customer_id == "client-42"

def test_production_rejects_duplicate_input_lot_lines():
    with pytest.raises(ValidationError, match="only once"):
        CommercialProductionDraft(
            production_date="2026-11-02",
            inputs=[_input("olive-lot-1"), _input("olive-lot-1")],
            actual_oil_output_kg="175",
            output_tank_id="tank-01",
            idempotency_key="production-run-0005",
        )


def test_production_rejects_impossible_calendar_date():
    with pytest.raises(ValidationError):
        CommercialProductionDraft(
            production_date="2026-02-30",
            inputs=[_input("olive-lot-1")],
            actual_oil_output_kg="175",
            output_tank_id="tank-01",
            idempotency_key="production-run-invalid-date",
        )
