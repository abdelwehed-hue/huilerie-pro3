"""Validated command schema for physical wholesale sale returns."""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SaleReturnDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_sale_version: int = Field(ge=2)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    quarantine_tank_id: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=5, max_length=500)
    buyer_acknowledgement_reference: str | None = Field(default=None, max_length=120)
    idempotency_key: str = Field(min_length=16, max_length=128)
