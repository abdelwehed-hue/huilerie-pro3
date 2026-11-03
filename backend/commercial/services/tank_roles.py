"""Audited, fail-closed commercial tank role assignment."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from commercial.permissions import require_commercial_permission


VALID_TANK_ROLES = frozenset({"NORMAL", "QUARANTINE"})


async def set_tank_role(
    db: Any, tank_id: str, *, role: str, expected_version: int,
    actor_user: dict[str, Any], actor_user_id: str,
    audit_event_id: str, changed_at: datetime, session: Any,
) -> dict[str, Any]:
    """Change tank role only while its ledger balance is empty; audit atomically."""
    require_commercial_permission(actor_user, "commercial.manage_tanks")
    if role not in VALID_TANK_ROLES:
        raise ValueError("Unsupported commercial tank role")
    if expected_version < 1 or not actor_user_id or not audit_event_id:
        raise ValueError("Expected version and stable actor/audit identifiers are required")
    if changed_at.tzinfo is None:
        raise ValueError("changed_at must be timezone-aware")

    tanks = db["commercial_tanks"]
    tank = await tanks.find_one({"id": tank_id, "active": True}, {"_id": 0}, session=session)
    if not tank:
        raise ValueError("Unknown or inactive commercial tank")
    version = int(tank.get("version", 1))
    current_role = tank.get("role", "NORMAL")
    if version != expected_version:
        raise ValueError("Tank version conflict; reload before changing its role")
    if current_role == role:
        return tank

    occupied = await db["commercial_stock_balances"].find_one(
        {"location_id": tank_id, "quantity_kg": {"$gt": 0}},
        {"_id": 0, "quantity_kg": 1}, session=session,
    )
    if occupied:
        raise ValueError("Tank role can change only when its stock balance is zero")

    version_filter = {"version": expected_version}
    if "version" not in tank:
        version_filter = {"version": {"$exists": False}}
    updated = await tanks.update_one(
        {"id": tank_id, "active": True, **version_filter},
        {"$set": {
            "role": role, "updated_at": changed_at.astimezone(timezone.utc),
            "updated_by": actor_user_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if updated.matched_count != 1:
        raise ValueError("Tank version conflict; reload before changing its role")

    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_tank",
        "entity_id": tank_id, "action": "TANK_ROLE_CHANGED",
        "actor_user_id": actor_user_id,
        "created_at": changed_at.astimezone(timezone.utc),
        "details": {
            "previous_role": current_role, "role": role,
            "version": version + 1,
        },
    }, session=session)
    return await tanks.find_one({"id": tank_id}, {"_id": 0}, session=session)
