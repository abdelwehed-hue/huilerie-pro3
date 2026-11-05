"""GS configuration — independent MongoDB database."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

GS_MONGO_URL = os.environ.get("GS_MONGO_URL", "").strip()
GS_DB_NAME = os.environ.get("GS_DB_NAME", "oroverde_gs").strip() or "oroverde_gs"

GS_PERMISSIONS = [
    "gs.read",
    "gs.manage_customers",
    "gs.manage_suppliers",
    "gs.manage_purchases",
    "gs.manage_reception",
    "gs.manage_quality",
    "gs.manage_production",
    "gs.manage_tanks",
    "gs.post_stock",
    "gs.manage_sales",
    "gs.manage_invoices",
    "gs.manage_payments",
    "gs.manage_returns",
    "gs.view_reports",
    "gs.view_audit",
    "gs.manage_permissions",
]


def require_gs_mongo_url() -> str:
    if not GS_MONGO_URL:
        raise RuntimeError(
            "GS_MONGO_URL is missing. Configure an independent MongoDB URL for the GS database "
            "(do not reuse the main app database)."
        )
    return GS_MONGO_URL
