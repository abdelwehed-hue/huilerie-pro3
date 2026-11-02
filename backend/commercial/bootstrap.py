"""Fail-closed bootstrap for commercial numbering infrastructure."""
import logging
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from commercial.inventory_bootstrap import COMMERCIAL_DOCUMENT_TYPES

logger = logging.getLogger(__name__)

# Document types have independent counters for every season.
async def ensure_commercial_numbering(db, season_codes: list[str]) -> None:
    """Create the unique counter index and missing counters for configured seasons.

    Call during an explicit commercial bootstrap, not as an unawaited background
    task. The caller must supply season codes obtained from validated season
    configuration. This function never invents or activates a season.
    """
    counters = db["commercial_counters"]
    await counters.create_index(
        [("season_code", ASCENDING), ("document_type", ASCENDING)],
        unique=True,
        name="uq_commercial_season_document_type",
    )

    for season_code in season_codes:
        from commercial.services.numbering import validate_numbering_components
        validate_numbering_components(season_code, "LOT")
        for document_type in COMMERCIAL_DOCUMENT_TYPES:
            key = {"season_code": season_code, "document_type": document_type}
            try:
                await counters.update_one(
                    key,
                    {"$setOnInsert": {**key, "last_sequence": 0}},
                    upsert=True,
                )
            except DuplicateKeyError:
                # Another application instance initialized the same counter.
                existing = await counters.find_one(key, {"_id": 1})
                if not existing:
                    raise
    logger.info("Commercial numbering ready for %d configured season(s)", len(season_codes))
