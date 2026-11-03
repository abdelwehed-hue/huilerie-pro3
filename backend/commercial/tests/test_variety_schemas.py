import pytest
from pydantic import ValidationError

from commercial.schemas.varieties import CommercialVarietyDraft


def test_commercial_variety_supports_french_and_arabic_names():
    variety = CommercialVarietyDraft(
        code="CHEMLALI",
        name_fr="Chemlali",
        name_ar="شملالي",
    )
    assert variety.code == "CHEMLALI"
    assert variety.name_ar == "شملالي"


@pytest.mark.parametrize("payload", [
    {"code": "x", "name_fr": "Chemlali"},
    {"code": "BAD CODE", "name_fr": "Chemlali"},
    {"code": "CHEMLALI", "name_fr": "x"},
    {"code": "CHEMLALI", "name_fr": "Chemlali", "unexpected": "not allowed"},
])
def test_commercial_variety_rejects_invalid_or_unexpected_fields(payload):
    with pytest.raises(ValidationError):
        CommercialVarietyDraft(**payload)
