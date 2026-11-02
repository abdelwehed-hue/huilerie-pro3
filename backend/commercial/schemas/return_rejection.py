"""Command schema for rejecting and dispatching a physical sale return back to its buyer."""
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class RejectSaleReturnCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    rejection_date: date
    expected_return_version: int = Field(ge=1)
    reason: str = Field(min_length=5, max_length=500)
    buyer_receipt_reference: str = Field(min_length=3, max_length=120)
    idempotency_key: str = Field(min_length=16, max_length=128)
