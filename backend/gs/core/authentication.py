"""GS auth: reuse Oro Verde identity; never store passwords in GS DB."""
from __future__ import annotations

from fastapi import HTTPException, Request

from lib.auth import current_user as oro_current_user


async def gs_current_user(request: Request) -> dict:
    """Identity from original app only."""
    try:
        user = await oro_current_user(request)
    except HTTPException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    if not user:
        raise HTTPException(401, "not_authenticated")
    return user
