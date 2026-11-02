"""Commercial olive purchase command schemas.

Totals are intentionally not accepted from the client; the service computes
them from validated line quantities and unit prices using Decimal arithmetic.
"""
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class OlivePurchaseLine(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    variety_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    unit_price_dt: Decimal = Field(ge=Decimal("0"), max_digits=18, decimal_places=3)


class OlivePurchaseDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    supplier_id: str = Field(min_length=1, max_length=100)
    purchase_date: date
    lines: tuple[OlivePurchaseLine, ...] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)

    @model_validator(mode="after")
    def validate_lines(self):
        if sum((line.quantity_kg for line in self.lines), Decimal("0")) <= 0:
            raise ValueError("Purchase quantity must be positive")
        return self


class ApproveOlivePurchaseCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=16, max_length=128)
