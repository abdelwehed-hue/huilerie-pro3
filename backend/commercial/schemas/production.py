"""Validated commands for commercial olive-to-oil production runs.

A run has one owner only. Mixing mill-owned and customer-custody olives in a
single output lot is rejected; ownership must remain traceable end to end.
Actual oil output is recorded, never estimated from a configured yield rate.
"""
from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from commercial.schemas.inventory import OwnerRef


QuantityKg = Annotated[Decimal, Field(gt=Decimal("0"), max_digits=18, decimal_places=3)]


class ProductionInputLine(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    olive_lot_id: str = Field(min_length=1, max_length=100)
    source_location_id: str = Field(min_length=1, max_length=100)
    owner: OwnerRef
    quantity_kg: QuantityKg


class CommercialProductionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    production_date: date
    inputs: tuple[ProductionInputLine, ...] = Field(min_length=1, max_length=100)
    actual_oil_output_kg: QuantityKg
    output_tank_id: str = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)

    @model_validator(mode="after")
    def validate_production_balance_and_ownership(self):
        lot_ids = [line.olive_lot_id for line in self.inputs]
        if len(lot_ids) != len(set(lot_ids)):
            raise ValueError("Each olive lot may appear only once in a production run")
        if len(self.inputs) != 1:
            raise ValueError("A production run must use exactly one olive batch; mixing batches is not allowed")
        owners = {line.owner.model_dump_json() for line in self.inputs}
        if len(owners) != 1:
            raise ValueError(
                "A production run cannot mix mill-owned and customer-custody olives"
            )
        input_total = sum((line.quantity_kg for line in self.inputs), Decimal("0"))
        if self.actual_oil_output_kg > input_total:
            raise ValueError("Actual oil output cannot exceed total olive input mass")
        return self

    @property
    def total_olive_input_kg(self) -> Decimal:
        return sum((line.quantity_kg for line in self.inputs), Decimal("0"))

    @property
    def extraction_rate_percent(self) -> Decimal:
        return (self.actual_oil_output_kg / self.total_olive_input_kg) * Decimal("100")

    @property
    def owner(self) -> OwnerRef:
        return self.inputs[0].owner
