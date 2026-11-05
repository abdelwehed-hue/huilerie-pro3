"""GS health endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from gs.database.connection import gs_health
from gs.config import GS_DB_NAME

router = APIRouter(tags=["gs-health"])


@router.get("/health")
async def health():
    h = await gs_health()
    return {"module": "gs", "database": GS_DB_NAME, **h}
