"""GS FastAPI router — mounted under /api/gs without touching legacy commercial."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from gs.modules.customers.router import router as customers_router
from gs.modules.suppliers.router import router as suppliers_router
from gs.modules.purchases.router import router as purchases_router
from gs.modules.materials.router import router as materials_router
from gs.modules.tanks.router import router as tanks_router
from gs.modules.health.router import router as health_router
from gs.modules.reception.router import router as reception_router
from gs.modules.sales.router import router as sales_router
from gs.modules.invoices.router import router as invoices_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gs", tags=["gs"])

router.include_router(health_router)
router.include_router(customers_router)
router.include_router(suppliers_router)
router.include_router(purchases_router)
router.include_router(materials_router)
router.include_router(tanks_router)
router.include_router(reception_router)
router.include_router(sales_router)
router.include_router(invoices_router)


@router.get("/status")
async def gs_status():
    return {
        "module": "Gestion Commerciale GS",
        "version": "1.1.0-reception-sales-invoices",
        "isolated": True,
        "database": "oroverde_gs",
        "legacy_commercial": False,
        "modules": [
            "customers", "suppliers", "purchases", "materials",
            "tanks", "reception", "sales", "invoices",
        ],
    }
