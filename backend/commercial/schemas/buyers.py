"""Commercial wholesale buyer master-data schemas."""
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CommercialBuyerDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(min_length=2, max_length=160)
    contact_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    tax_identifier: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Buyer name is required")
        return value


class CommercialBuyerUpdate(CommercialBuyerDraft):
    """Complete profile replacement guarded by an optimistic version."""
    expected_version: int = Field(ge=1)


class CommercialBuyerStatusCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    expected_version: int = Field(ge=1)
    active: bool
