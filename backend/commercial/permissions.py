"""Fail-closed authorization policy for the commercial module."""
from __future__ import annotations

from typing import Any

ADMIN_PERMISSIONS = frozenset({
    "commercial.read", "commercial.manage_tanks", "commercial.manage_lots",
    "commercial.post_stock", "commercial.reverse_stock", "commercial.manage_sales", "commercial.manage_custody",
    "commercial.manage_purchases", "commercial.manage_production",
    "commercial.lab_record", "commercial.quality_release", "commercial.view_audit",
    "commercial.manage_preproduction_samples", "commercial.edit_records", "commercial.delete_records",
})
ASSIGNABLE_COMMERCIAL_PERMISSIONS = frozenset({
    "commercial.read", "commercial.lab_record", "commercial.quality_release",
    "commercial.view_audit", "commercial.manage_preproduction_samples",
    "commercial.edit_records", "commercial.delete_records",
})


def effective_commercial_permissions(user: dict[str, Any]) -> frozenset[str]:
    if not isinstance(user, dict) or not user.get("active"):
        return frozenset()
    if user.get("role") == "admin":
        return ADMIN_PERMISSIONS
    if user.get("role") != "worker":
        return frozenset()
    assigned = user.get("commercial_permissions", [])
    if not isinstance(assigned, list):
        return frozenset({"commercial.read"})
    return frozenset({"commercial.read", *(
        item for item in assigned if item in ASSIGNABLE_COMMERCIAL_PERMISSIONS
    )})


def require_commercial_permission(user: dict[str, Any], permission: str) -> None:
    if permission not in effective_commercial_permissions(user):
        raise PermissionError(f"Missing commercial permission: {permission}")
