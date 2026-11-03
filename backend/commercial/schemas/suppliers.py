"""Commercial supplier reference schemas, isolated from pressing clients."""
from pydantic import BaseModel, ConfigDict, Field


class CommercialSupplierDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    tax_identifier: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)


class CommercialSupplierUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    expected_version: int = Field(ge=1)
    name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    tax_identifier: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
