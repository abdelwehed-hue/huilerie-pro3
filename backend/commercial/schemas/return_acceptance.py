"""Validated commercial acceptance command for a received sale return."""
from pydantic import BaseModel, ConfigDict, Field


class AcceptSaleReturnCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_return_version: int = Field(ge=1)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=128)
