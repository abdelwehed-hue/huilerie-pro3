"""Atomic season-based numbering for GS documents.

Material: SEASON + A + SEQUENCE  → 2627A0001
Invoice:  SEASON + F + SEQUENCE  → 2627F0001
"""
from __future__ import annotations

from pymongo import ReturnDocument

from gs.core.exceptions import GSSeasonError
from gs.core.seasons import require_season_for_numbering, season_code
from gs.database.connection import get_gs_db


async def _next_seq(counter_key: str) -> int:
    db = get_gs_db()
    doc = await db.gs_counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


async def next_material_code(season: str | None = None) -> tuple[str, str]:
    """Generate permanent material code once. Returns (code, season)."""
    if season:
        sc = season_code(season)
        season_id = season
    else:
        season_id, sc = await require_season_for_numbering()
    seq = await _next_seq(f"material:{season_id}")
    code = f"{sc}A{seq:04d}"
    return code, season_id


async def next_invoice_number(season: str | None = None) -> tuple[str, str]:
    """Independent invoice numbering: 2627F0001."""
    if season:
        sc = season_code(season)
        season_id = season
    else:
        season_id, sc = await require_season_for_numbering()
    seq = await _next_seq(f"invoice:{season_id}")
    number = f"{sc}F{seq:04d}"
    return number, season_id


async def next_document_number(doc_type: str, season: str | None = None) -> tuple[str, str]:
    letters = {
        "material": "A", "invoice": "F", "sale": "V", "payment": "P",
        "return": "R", "reception": "E", "production": "D",
    }
    letter = letters.get(doc_type)
    if not letter:
        raise GSSeasonError(f"Unknown document type for numbering: {doc_type}")
    if season:
        sc = season_code(season)
        season_id = season
    else:
        season_id, sc = await require_season_for_numbering()
    seq = await _next_seq(f"{doc_type}:{season_id}")
    return f"{sc}{letter}{seq:04d}", season_id
