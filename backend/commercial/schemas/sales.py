"""Wholesale sale, invoice approval, and payment command schemas."""
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WholesaleSaleDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    sale_date: date
    buyer_id: str = Field(min_length=1, max_length=100)
    oil_lot_id: str = Field(min_length=1, max_length=100)
    source_tank_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    unit_price_dt: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)


class ApproveWholesaleSaleCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expected_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=16, max_length=128)


class SalePaymentDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    payment_date: date
    amount_dt: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    method: Literal["CASH", "BANK_TRANSFER", "CHEQUE"]
    reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)
    expected_invoice_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=16, max_length=128)

    
    @model_validator(mode="after")
    def validate_payment_reference(self):
        if self.method in {"BANK_TRANSFER", "CHEQUE"} and not (self.reference or "").strip():
            raise ValueError("A reference is required for bank transfers and cheques")
        return self
