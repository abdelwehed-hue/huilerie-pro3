"""Season-scoped commercial document number formatting.

Database counter allocation must be implemented separately using an atomic
MongoDB operation inside the caller's transaction. This module only formats
and validates already-allocated sequence values.
"""
import re

_SEASON_RE = re.compile(r"^[0-9]{4}$")
_DOCUMENT_TYPE_RE = re.compile(r"^[A-Z]{2,8}$")


def format_document_number(season_code: str, document_type: str, sequence: int) -> str:
    """Format a commercial number, e.g. 2627LOT0001."""
    if not isinstance(season_code, str) or not _SEASON_RE.fullmatch(season_code):
        raise ValueError("season_code must contain exactly four digits")
    if not isinstance(document_type, str) or not _DOCUMENT_TYPE_RE.fullmatch(document_type):
        raise ValueError("document_type must contain 2 to 8 uppercase letters")
    if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
        raise ValueError("sequence must be a positive integer")
    return f"{season_code}{document_type}{sequence:04d}"
