from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from commercial.services.tank_roles import set_tank_role


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def find_one(self, query, projection=None, session=None):
        for row in self.rows:
            matched = True
            for key, expected in query.items():
                actual = row.get(key)
                if isinstance(expected, dict):
                    if "$gt" in expected and not (actual is not None and actual > expected["$gt"]):
                        matched = False
                    if "$exists" in expected and ((key in row) != expected["$exists"]):
                        matched = False
                elif actual != expected:
                    matched = False
            if matched:
                return row
        return None

    async def update_one(self, query, update, session=None):
        row = await self.find_one(query, session=session)
        if not row:
            return SimpleNamespace(matched_count=0)
        row.update(update.get("$set", {}))
        if "$inc" in update:
            for k, v in update["$inc"].items():
                row[k] = row.get(k, 0) + v
        return SimpleNamespace(matched_count=1)

    async def insert_one(self, row, session=None):
        self.rows.append(dict(row))


class Database:
    def __init__(self, tanks, balances=None):
        self.collections = {
            "commercial_tanks": Collection(tanks),
            "commercial_stock_balances": Collection(balances),
            "commercial_audit_events": Collection(),
        }

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


@pytest.mark.asyncio
async def test_role_change_requires_empty_tank_and_writes_audit():
    db = Database([{"id": "tank-01", "active": True, "role": "NORMAL", "version": 1}])
    result = await set_tank_role(
        db, "tank-01", role="QUARANTINE", expected_version=1,
        actor_user={"active": True, "role": "admin"}, actor_user_id="admin-1",
        audit_event_id="audit-1", changed_at=datetime.now(timezone.utc), session=object(),
    )
    assert result["role"] == "QUARANTINE"
    assert result["version"] == 2
    event = db["commercial_audit_events"].rows[0]
    assert event["action"] == "TANK_ROLE_CHANGED"
    assert event["details"]["previous_role"] == "NORMAL"


@pytest.mark.asyncio
async def test_role_change_rejected_when_any_positive_balance_exists():
    db = Database(
        [{"id": "tank-01", "active": True, "role": "NORMAL", "version": 1}],
        [{"location_id": "tank-01", "quantity_kg": 0.001}],
    )
    with pytest.raises(ValueError, match="balance is zero"):
        await set_tank_role(
            db, "tank-01", role="QUARANTINE", expected_version=1,
            actor_user={"active": True, "role": "admin"}, actor_user_id="admin-1",
            audit_event_id="audit-1", changed_at=datetime.now(timezone.utc), session=object(),
        )
    assert db["commercial_tanks"].rows[0]["role"] == "NORMAL"
    assert db["commercial_audit_events"].rows == []


@pytest.mark.asyncio
async def test_role_change_rejects_stale_version():
    db = Database([{"id": "tank-01", "active": True, "role": "NORMAL", "version": 3}])
    with pytest.raises(ValueError, match="version conflict"):
        await set_tank_role(
            db, "tank-01", role="QUARANTINE", expected_version=2,
            actor_user={"active": True, "role": "admin"}, actor_user_id="admin-1",
            audit_event_id="audit-1", changed_at=datetime.now(timezone.utc), session=object(),
        )
