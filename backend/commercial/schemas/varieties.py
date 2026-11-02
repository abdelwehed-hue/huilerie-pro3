"""Commercial olive variety master data, isolated from legacy pressing settings."""
from pydantic import BaseModel, ConfigDict, Field


class CommercialVarietyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    name_fr: str = Field(min_length=2, max_length=100)
    name_ar: str | None = Field(default=None, min_length=2, max_length=100)
    notes: str | None = Field(default=None, max_length=500)
