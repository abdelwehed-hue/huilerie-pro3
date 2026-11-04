"""Season-scoped commercial document numbering.

Formatting is pure. Allocation uses an atomic MongoDB increment and must be
called with the active session of the transaction that creates the document.
The counter document must have been initialized before this operation.
"""
import re
from typing import Any

from pymongo import ReturnDocument

_SEASON_RE = re.compile(r"^[0-9]{4}$")
_DOCUMENT_TYPE_RE = re.compile(r"^[A-Z]{2,8}$")


def validate_numbering_components(season_code: str, document_type: str) -> None:
    if not isinstance(season_code, str) or not _SEASON_RE.fullmatch(season_code):
        raise ValueError("season_code must contain exactly four digits")
    # A season is two consecutive two-digit years (e.g. 2627), not a
    # calendar year such as 2026. Handle the century rollover (e.g. 9900).
    start_year = int(season_code[:2])
    end_year = int(season_code[2:])
    if end_year != (start_year + 1) % 100:
        raise ValueError("season_code must represent two consecutive years (YYZZ)")
    if not isinstance(document_type, str) or not _DOCUMENT_TYPE_RE.fullmatch(document_type):
        raise ValueError("document_type must contain 2 to 8 uppercase letters")


def format_document_number(season_code: str, document_type: str, sequence: int) -> str:
    """Format an allocated number, e.g. 2627LOT0001."""
    validate_numbering_components(season_code, document_type)
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        raise ValueError("sequence must be a positive integer")
    return f"{season_code}{document_type}{sequence:04d}"



async def reserve_batch_code(
    counters_collection: Any,
    season_code: str,
    *,
    session: Any,
) -> str:
    """Allocate the user-facing, season-scoped olive batch code (YYZZA0001)."""
    validate_numbering_components(season_code, "BATCH")
    counter = await counters_collection.find_one_and_update(
        {"season_code": season_code, "document_type": "BATCH"},
        {"$inc": {"last_sequence": 1}},
        projection={"last_sequence": 1},
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not counter:
        raise RuntimeError(
            f"Missing commercial counter for season={season_code}, type=BATCH"
        )
    return f"{season_code}A{counter['last_sequence']:04d}"


async def reserve_document_number(
    counters_collection: Any,
    season_code: str,
    document_type: str,
    *,
    session: Any,
) -> str:
    """Atomically increment a pre-created counter inside the document transaction.

    Counter initialization and the unique (season_code, document_type) index
    are bootstrap responsibilities. A missing counter is a configuration
    error: this function deliberately does not upsert during issuance.
    """
    validate_numbering_components(season_code, document_type)
    counter = await counters_collection.find_one_and_update(
        {"season_code": season_code, "document_type": document_type},
        {"$inc": {"last_sequence": 1}},
        projection={"last_sequence": 1},
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not counter:
        raise RuntimeError(
            f"Missing commercial counter for season={season_code}, type={document_type}"
        )
    return format_document_number(
        season_code, document_type, counter["last_sequence"]
    )
