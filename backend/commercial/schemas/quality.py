"""Laboratory result submission and independent quality-release commands."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


MeasurementValue = Annotated[Decimal, Field(max_digits=18, decimal_places=6)]


class QualityMeasurement(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_]+$")
    value: MeasurementValue
    unit: str = Field(min_length=1, max_length=20)


class QualityAssessmentDraft(BaseModel):
    """Laboratory technician records observations only; no release decision."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    oil_lot_id: str = Field(min_length=1, max_length=100)
    expected_lot_version: int = Field(ge=1)
    sample_reference: str = Field(min_length=1, max_length=100)
    sample_date: date
    tested_date: date
    laboratory_name: str = Field(min_length=2, max_length=160)
    specification_reference: str = Field(min_length=2, max_length=160)
    measurements: tuple[QualityMeasurement, ...] = Field(default=(), max_length=40)
    # Fixed olive-oil analysis fields mirrored from the legacy Laboratory form.
    # Optional to preserve compatibility with assessments already submitted through
    # the former generic-measurement interface.
    acidity: MeasurementValue | None = None
    peroxide: MeasurementValue | None = None
    k232: MeasurementValue | None = None
    k270: MeasurementValue | None = None
    oil_content_pct: MeasurementValue | None = None
    classification: Literal["extra_vierge", "vierge", "lampante"] | None = None
    oil_type: str | None = Field(default=None, max_length=100)
    notes: str = Field(default="", max_length=2000)
    idempotency_key: str = Field(min_length=16, max_length=128)

    @model_validator(mode="after")
    def validate_measurement_codes_and_dates(self):
        codes = [measurement.code for measurement in self.measurements]
        if len(codes) != len(set(codes)):
            raise ValueError("Measurement codes must be unique within an assessment")
        if not self.measurements and self.acidity is None:
            raise ValueError("At least the acidity result or one generic measurement is required")
        if self.oil_type is not None and not self.oil_type.strip():
            raise ValueError("Oil type cannot be blank")
        if self.tested_date < self.sample_date:
            raise ValueError("Testing date cannot precede the sample date")
        return self


class QualityReleaseCommand(BaseModel):
    """Independent reviewer approves or rejects one immutable lab assessment."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    assessment_id: str = Field(min_length=1, max_length=100)
    expected_lot_version: int = Field(ge=1)
    decision: Literal["RELEASED", "REJECTED"]
    decision_reason: str = Field(min_length=10, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)


class QualityAssessmentUpdate(QualityAssessmentDraft):
    """Update command reuses validated measurement fields and lot version."""
