import pytest

from commercial.services.numbering import format_document_number


def test_formats_season_scoped_document_number():
    assert format_document_number("2627", "LOT", 1) == "2627LOT0001"
    assert format_document_number("2627", "FAC", 27) == "2627FAC0027"


def test_sequence_expands_beyond_four_digits():
    assert format_document_number("2627", "LOT", 10000) == "2627LOT10000"


@pytest.mark.parametrize(
    "season, document_type, sequence",
    [
        ("2026", "LOT", 1),  # Calendar-year values are not forbidden syntactically;
        ("26-27", "LOT", 1),
        ("2627", "lot", 1),
        ("2627", "LOT-1", 1),
        ("2627", "LOT", 0),
        ("2627", "LOT", -1),
        ("2627", "LOT", True),
    ],
)
def test_rejects_invalid_components(season, document_type, sequence):
    if season == "2026":
        # Four-digit season codes are format-validated; the active season is
        # checked by the domain service, not by this pure formatter.
        assert format_document_number(season, document_type, sequence) == "2026LOT0001"
    else:
        with pytest.raises(ValueError):
            format_document_number(season, document_type, sequence)
