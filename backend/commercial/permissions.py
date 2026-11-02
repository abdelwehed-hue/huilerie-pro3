"""Fail-closed authorization policy for the commercial module.

Until a dedicated commercial role/permission editor is implemented, only
administrators may post or reverse commercial stock. Workers may read only.
Do not infer commercial rights from the legacy worker role.
"""
from __future__ import annotations

from typing import Any

COMMERCIAL_PERMISSIONS = {
    "admin": frozenset({
        "commercial.read",
        "commercial.manage_tanks",
        "commercial.manage_lots",
        "commercial.post_stock",
        "commercial.reverse_stock",
        "commercial.manage_quality",
        "commercial.manage_sales",
        "commercial.manage_purchases",
        "commercial.manage_production",
        "commercial.view_audit",
    }),
    "worker": frozenset({"commercial.read"}),
}


def require_commercial_permission(user: dict[str, Any], permission: str) -> None:
    if not isinstance(user, dict) or not user.get("active"):
        raise PermissionError("An active authenticated user is required")
    role = user.get("role")
    allowed = COMMERCIAL_PERMISSIONS.get(role, frozenset())
    if permission not in allowed:
        raise PermissionError(f"Missing commercial permission: {permission}")
