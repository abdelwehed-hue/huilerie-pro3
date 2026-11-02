"""Immutable payment reversal command schema."""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PaymentReversalDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    amount_dt: Decimal = Field(gt=Decimal("0"), max_digits=15, decimal_places=3)
    expected_invoice_version: int = Field(ge=1)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=128)
