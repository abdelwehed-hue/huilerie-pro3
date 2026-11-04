"""Commands for preproduction olive-to-oil trial samples."""
from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

QuantityKg = Annotated[Decimal, Field(gt=Decimal("0"), max_digits=18, decimal_places=3)]


class PreproductionSampleDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    source_olive_lot_id: str = Field(min_length=1, max_length=100)
    source_location_id: str = Field(min_length=1, max_length=100)
    input_olive_quantity_kg: QuantityKg
    sample_oil_quantity_kg: QuantityKg
    trial_date: date
    notes: str = Field(default="", max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)


class CancelPreproductionSampleCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    reason: str = Field(min_length=5, max_length=1000)
