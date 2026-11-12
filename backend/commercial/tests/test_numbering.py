import pytest

from commercial.services.numbering import (
    format_document_number,
    reserve_batch_code,
    reserve_document_number,
    validate_numbering_components,
)


def test_formats_season_scoped_document_number():
    assert format_document_number("2627", "LOT", 1) == "2627LOT0001"
    assert format_document_number("2627", "FAC", 27) == "2627F0027"



def test_formats_unified_olive_batch_code():
    assert validate_numbering_components("2627", "BATCH") is None


@pytest.mark.asyncio
async def test_reserve_batch_code_uses_shared_season_counter_and_upsert():
    class CounterCollection:
        async def find_one_and_update(
            self, query, update, *, projection, return_document, upsert, session
        ):
            assert query == {"season_code": "2627", "document_type": "BATCH"}
            assert update == {"$inc": {"last_sequence": 1}}
            assert projection == {"last_sequence": 1}
            assert upsert is True
            assert session is marker_session
            return {"last_sequence": 8}

    marker_session = object()
    result = await reserve_batch_code(
        CounterCollection(), "2627", session=marker_session
    )
    assert result == "2627A0008"

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


def test_zero_is_a_valid_first_sequence():
    assert format_document_number("2627", "LOT", 0) == "2627LOT0000"
    assert format_document_number("2627", "FAC", 0) == "2627F0000"


@pytest.mark.parametrize("sequence", [-1, True, 1.5, "1"])
def test_rejects_invalid_sequences(sequence):
    with pytest.raises(ValueError):
        format_document_number("2627", "LOT", sequence)


@pytest.mark.asyncio
async def test_reserve_uses_atomic_increment_and_transaction_session():
    class CounterCollection:
        async def find_one_and_update(
            self, query, update, *, projection, return_document, session
        ):
            assert query == {"season_code": "2627", "document_type": "LOT"}
            assert update == {"$inc": {"last_sequence": 1}}
            assert projection == {"last_sequence": 1}
            assert session is marker_session
            return {"last_sequence": 3}

    marker_session = object()
    result = await reserve_document_number(
        CounterCollection(), "2627", "LOT", session=marker_session
    )
    assert result == "2627LOT0003"


@pytest.mark.asyncio
async def test_reserve_fails_closed_when_counter_is_missing():
    class MissingCounterCollection:
        async def find_one_and_update(self, *args, **kwargs):
            return None

    with pytest.raises(RuntimeError, match="Missing commercial counter"):
        await reserve_document_number(
            MissingCounterCollection(), "2627", "LOT", session=object()
        )
