from datetime import date

import pytest
from pydantic import ValidationError

from commercial.schemas.quality import QualityAssessmentDraft


def _draft(**overrides):
    values = {
        "oil_lot_id": "oil-lot-1",
        "expected_lot_version": 1,
        "sample_reference": "SAMPLE-001",
        "sample_date": date(2026, 11, 2),
        "tested_date": date(2026, 11, 2),
        "laboratory_name": "Laboratoire central",
        "specification_reference": "SPEC-2026-A",
        "measurements": [
            {"code": "ACIDITY", "value": "0.35", "unit": "%"},
            {"code": "PEROXIDE", "value": "8.2", "unit": "meq O2/kg"},
        ],
        "decision": "RELEASED",
        "decision_reason": "Results reviewed against the cited specification.",
        "idempotency_key": "quality-assessment-test-0001",
    }
    values.update(overrides)
    return QualityAssessmentDraft(**values)


def test_quality_assessment_records_results_and_explicit_decision():
    draft = _draft()
    assert len(draft.measurements) == 2
    assert draft.decision == "RELEASED"
    assert draft.specification_reference == "SPEC-2026-A"


def test_quality_assessment_rejects_duplicate_measurement_codes():
    with pytest.raises(ValidationError, match="unique"):
        _draft(measurements=[
            {"code": "ACIDITY", "value": "0.35", "unit": "%"},
            {"code": "ACIDITY", "value": "0.40", "unit": "%"},
        ])


def test_quality_assessment_rejects_test_date_before_sample_date():
    with pytest.raises(ValidationError, match="cannot precede"):
        _draft(sample_date=date(2026, 11, 3), tested_date=date(2026, 11, 2))


def test_quality_assessment_requires_positive_lot_version_and_measurement():
    with pytest.raises(ValidationError):
        _draft(expected_lot_version=0)
    with pytest.raises(ValidationError):
        _draft(measurements=[])


def test_quality_measurements_allow_signed_values_when_method_requires_them():
    draft = _draft(measurements=[
        {"code": "DELTA_K", "value": "-0.001", "unit": "index"},
    ], laboratory_name="Lab", specification_reference="SPEC-A")
    assert str(draft.measurements[0].value) == "-0.001"
