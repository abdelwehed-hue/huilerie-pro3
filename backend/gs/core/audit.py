"""Immutable GS audit log."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from gs.database.connection import get_gs_db


async def write_audit(
    *,
    user_id: str,
    action: str,
    module: str,
    document_id: str = "",
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    reason: str = "",
    meta: Optional[dict[str, Any]] = None,
) -> str:
    db = get_gs_db()
    audit_id = str(uuid.uuid4())
    doc = {
        "id": audit_id,
        "user_id": user_id,
        "action": action,
        "module": module,
        "document_id": document_id,
        "before": before,
        "after": after,
        "reason": reason,
        "meta": meta or {},
        "at": datetime.now(timezone.utc),
    }
    await db.gs_audit.insert_one(doc)
    return audit_id
