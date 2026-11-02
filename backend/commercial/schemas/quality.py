"""Lab measurement and explicit quality-release command schemas.

No regulatory thresholds are hard-coded here. A qualified reviewer records
measured values and an explicit release/rejection decision against the
applicable laboratory or regulatory specification.
"""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


MeasurementValue = Annotated[
    Decimal, Field(max_digits=18, decimal_places=6)
]


class QualityMeasurement(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_]+$")
    value: MeasurementValue
    unit: str = Field(min_length=1, max_length=20)


class QualityAssessmentDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    oil_lot_id: str = Field(min_length=1, max_length=100)
    expected_lot_version: int = Field(ge=1)
    sample_reference: str = Field(min_length=1, max_length=100)
    sample_date: date
    tested_date: date
    laboratory_name: str = Field(min_length=2, max_length=160)
    specification_reference: str = Field(min_length=2, max_length=160)
    measurements: tuple[QualityMeasurement, ...] = Field(min_length=1, max_length=40)
    decision: Literal["RELEASED", "REJECTED"]
    decision_reason: str = Field(min_length=10, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=128)

    @model_validator(mode="after")
    def validate_measurement_codes_and_dates(self):
        codes = [measurement.code for measurement in self.measurements]
        if len(codes) != len(set(codes)):
            raise ValueError("Measurement codes must be unique within an assessment")
        if self.tested_date < self.sample_date:
            raise ValueError("Testing date cannot precede the sample date")
        return self
