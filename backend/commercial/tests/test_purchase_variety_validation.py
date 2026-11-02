from datetime import date

import pytest

from commercial.schemas.purchases import OlivePurchaseDraft
from commercial.services.purchases import create_olive_purchase_draft


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length):
        return self.rows[:length]


class Collection:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or []

    async def find_one(self, query, projection=None, session=None):
        if self.row and all(self.row.get(k) == v for k, v in query.items()):
            return self.row
        return None

    def find(self, query, projection=None, session=None):
        return Cursor([
            row for row in self.rows
            if row.get("id") in query.get("id", {}).get("$in", [])
            and row.get("active") is query.get("active")
        ])


class Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


@pytest.mark.asyncio
async def test_purchase_draft_rejects_unregistered_or_inactive_variety_before_numbering():
    db = Database({
        "commercial_suppliers": Collection(row={"id": "supplier-1", "active": True}),
        "commercial_varieties": Collection(rows=[]),
    })
    draft = OlivePurchaseDraft(
        supplier_id="supplier-1",
        purchase_date=date(2026, 11, 2),
        lines=[{"variety_id": "not-registered", "quantity_kg": "100", "unit_price_dt": "1.200"}],
        idempotency_key="purchase-variety-validation-0001",
    )
    with pytest.raises(ValueError, match="varieties are unknown or inactive"):
        await create_olive_purchase_draft(
            db, draft, season_code="2627",
            actor_user={"active": True, "role": "admin"},
            actor_user_id="admin-1", purchase_id="purchase-1",
            audit_event_id="audit-1",
            created_at=__import__("datetime").datetime(2026, 11, 2, tzinfo=__import__("datetime").timezone.utc),
            session=object(),
        )
