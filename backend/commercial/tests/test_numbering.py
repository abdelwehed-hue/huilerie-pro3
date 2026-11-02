import pytest

from commercial.services.numbering import (
    format_document_number,
    validate_numbering_components,
)


def test_formats_season_scoped_document_number():
    assert format_document_number("2627", "LOT", 1) == "2627LOT0001"
    assert format_document_number("2627", "FAC", 27) == "2627FAC0027"


def test_sequence_expands_beyond_four_digits():
    assert format_document_number("2627", "LOT", 10000) == "2627LOT10000"


@pytest.mark.parametrize(
    "season, document_type",
    [
        ("26-27", "LOT"),
        ("262", "LOT"),
        ("26270", "LOT"),
        ("2627", "lot"),
        ("2627", "LOT-1"),
    ],
)
def test_rejects_invalid_numbering_components(season, document_type):
    with pytest.raises(ValueError):
        validate_numbering_components(season, document_type)


@pytest.mark.parametrize("sequence", [0, -1, True, 1.5, "1"])
def test_rejects_invalid_sequences(sequence):
    with pytest.raises(ValueError):
        format_document_number("2627", "LOT", sequence)
