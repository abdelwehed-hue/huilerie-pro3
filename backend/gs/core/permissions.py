"""GS permissions stored in gs_users_permissions, keyed by original user id."""
from __future__ import annotations

from fastapi import Depends, HTTPException

from gs.config import GS_PERMISSIONS
from gs.core.authentication import gs_current_user
from gs.database.connection import get_gs_db


async def get_user_permissions(user_id: str) -> list[str]:
    db = get_gs_db()
    doc = await db.gs_users_permissions.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return []
    perms = doc.get("permissions") or []
    return [p for p in perms if p in GS_PERMISSIONS]


async def set_user_permissions(user_id: str, permissions: list[str], by_user_id: str) -> dict:
    db = get_gs_db()
    clean = sorted({p for p in permissions if p in GS_PERMISSIONS})
    await db.gs_users_permissions.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "permissions": clean, "updated_by": by_user_id}},
        upsert=True,
    )
    return {"user_id": user_id, "permissions": clean}


def require_permission(*needed: str):
    """If multiple permissions are listed, ANY one is sufficient (OR)."""

    async def _dep(user: dict = Depends(gs_current_user)) -> dict:
        if user.get("role") == "admin":
            return user
        perms = await get_user_permissions(user["id"])
        if not needed:
            if not perms:
                raise HTTPException(403, "gs_access_denied")
            return user
        if any(p in perms for p in needed):
            return user
        raise HTTPException(403, f"missing_permissions:{','.join(needed)}")

    return _dep


async def require_gs_access(user: dict = Depends(gs_current_user)) -> dict:
    if user.get("role") == "admin":
        return user
    perms = await get_user_permissions(user["id"])
    if not perms:
        raise HTTPException(403, "gs_access_denied")
    return user
