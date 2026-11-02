"""Customer-owned olive intake and oil custody release command schemas."""
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CustomerOliveCustodyReceiptDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    customer_phone: str = Field(min_length=5, max_length=20, pattern=r"^\+?[0-9]{5,20}$")
    receipt_date: date
    variety_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    receiving_location_id: str = Field(min_length=1, max_length=100)
    customer_acknowledgement_reference: str = Field(min_length=3, max_length=120)
    source_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)


class CustomerOilCustodyReleaseDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    customer_phone: str = Field(min_length=5, max_length=20, pattern=r"^\+?[0-9]{5,20}$")
    release_date: date
    oil_lot_id: str = Field(min_length=1, max_length=100)
    source_tank_id: str = Field(min_length=1, max_length=100)
    quantity_kg: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=3)
    customer_acknowledgement_reference: str = Field(min_length=3, max_length=120)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=128)
