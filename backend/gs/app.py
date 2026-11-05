"""GS FastAPI router — mounted under /api/gs without touching legacy commercial."""
from __future__ import annotations

import logging
from importlib import import_module

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gs", tags=["gs"])


def _include(module_path: str, attr: str = "router") -> None:
    """Include a sub-router if available; never crash the main Oro Verde app."""
    try:
        mod = import_module(module_path)
        sub = getattr(mod, attr)
        router.include_router(sub)
        logger.info("GS loaded: %s", module_path)
    except Exception as exc:
        logger.warning("GS module skipped (%s): %s", module_path, exc)


_include("gs.modules.health.router")
_include("gs.modules.customers.router")
_include("gs.modules.suppliers.router")
_include("gs.modules.purchases.router")
_include("gs.modules.materials.router")
_include("gs.modules.tanks.router")
_include("gs.modules.reception.router")
_include("gs.modules.sales.router")
_include("gs.modules.invoices.router")


@router.get("/status")
async def gs_status():
    return {
        "module": "Gestion Commerciale GS",
        "version": "1.1.1-safe-imports",
        "isolated": True,
        "database": "oroverde_gs",
        "legacy_commercial": False,
    }
