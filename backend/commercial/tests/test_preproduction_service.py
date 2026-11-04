from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from bson.decimal128 import Decimal128

from commercial.schemas.preproduction import PreproductionSampleDraft
from commercial.services import preproduction as service


def get_path(row, key):
    value = row
    for part in key.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def find_one(self, query, projection=None, session=None):
        return next((row for row in self.rows if all(get_path(row, k) == v for k, v in query.items())), None)

    async def insert_one(self, row, session=None):
        self.rows.append(dict(row))
        return SimpleNamespace(inserted_id=row.get("id"))

    async def update_one(self, query, update, session=None):
        row = next((row for row in self.rows if all(get_path(row, k) == v for k, v in query.items())), None)
        if row is None:
            return SimpleNamespace(matched_count=0)
        row.update(update.get("$set", {}))
        for key in update.get("$unset", {}):
            row.pop(key, None)
        for key, value in update.get("$inc", {}).items():
            row[key] = row.get(key, 0) + value
        return SimpleNamespace(matched_count=1)


class Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


def make_draft(key="preproduction-sample-test-0001"):
    return PreproductionSampleDraft(
        source_olive_lot_id="olive-1",
        source_location_id="receiving-1",
        owner={"kind": "MILL"},
        input_olive_quantity_kg="12.500",
        sample_oil_quantity_kg="2.100",
        trial_date=date(2026, 11, 3),
        notes="Trial extraction for quality approval",
        idempotency_key=key,
    )


def make_db(quantity="100"):
    return Database({
        "commercial_lots": Collection([{
            "id": "olive-1", "product_kind": "OLIVE", "status": "OPEN",
            "owner": {"kind": "MILL"},
        }]),
        "commercial_locations": Collection([{
            "id": "receiving-1", "active": True, "kind": "STAGING",
        }]),
        "commercial_stock_balances": Collection([{
            "product_kind": "OLIVE", "lot_id": "olive-1",
            "owner": {"kind": "MILL"}, "location_id": "receiving-1",
            "quantity_kg": Decimal128(quantity),
        }]),
        "commercial_preproduction_samples": Collection(),
        "commercial_audit_events": Collection(),
        "commercial_custody_owners": Collection(),
    })


@pytest.mark.asyncio
async def test_preproduction_trial_creates_lab_only_oil_lot_and_posts_olive_consumption(monkeypatch):
    db = make_db()
    numbers = {"ESS": 0, "LOT": 0}
    async def reserve(_collection, _season, document_type, *, session):
        numbers[document_type] += 1
        return f"2627{document_type}{numbers[document_type]:04d}"
    movements = []
    async def post(_db, movement, **kwargs):
        movements.append(movement)
        return {"id": kwargs["movement_id"]}
    monkeypatch.setattr(service, "reserve_document_number", reserve)
    monkeypatch.setattr(service, "post_stock_movement", post)

    result = await service.create_preproduction_sample(
        db, make_draft(), season_code="2627",
        actor_user={"active": True, "role": "admin"}, actor_user_id="admin-1",
        sample_id="sample-1", oil_lot_id="oil-sample-1", movement_id="movement-1",
        movement_audit_id="movement-audit-1",
        created_at=datetime(2026, 11, 3, tzinfo=timezone.utc), session=object(),
    )

    assert result["document_number"] == "2627ESS0001"
    assert result["status"] == "COMPLETED"
    assert result["source_olive_lot_id"] == "olive-1"
    assert result["input_olive_quantity_kg"].to_decimal() == Decimal("12.500")
    sample_lot = next(row for row in db["commercial_lots"].rows if row["id"] == "oil-sample-1")
    assert sample_lot["lot_purpose"] == "PREPRODUCTION_SAMPLE"
    assert sample_lot["source_olive_lot_id"] == "olive-1"
    assert sample_lot["quality_status"] == "PENDING"
    assert len(movements) == 1
    assert movements[0].movement_kind == "CONSUMPTION"
    assert movements[0].product_kind == "OLIVE"
    assert movements[0].source_document_type == "ESS"
    assert movements[0].quantity_kg == Decimal("12.500")
    source_lot = db["commercial_lots"].rows[0]
    assert source_lot["preproduction_quality_status"] == "PENDING"
    assert source_lot["latest_preproduction_sample_id"] == "sample-1"



@pytest.mark.asyncio
async def test_rejected_preproduction_trial_cancellation_is_audited_and_closes_sample_lot():
    db = Database({
        "commercial_preproduction_samples": Collection([{
            "id": "trial-rejected", "oil_sample_lot_id": "oil-sample-rejected",
            "status": "COMPLETED",
        }]),
        "commercial_quality_assessments": Collection([{
            "id": "assessment-rejected", "oil_lot_id": "oil-sample-rejected",
            "status": "REVIEWED", "decision": "REJECTED",
        }]),
        "commercial_lots": Collection([{
            "id": "oil-sample-rejected", "lot_purpose": "PREPRODUCTION_SAMPLE",
            "status": "OPEN", "version": 1,
        }]),
        "commercial_audit_events": Collection(),
    })
    result = await service.cancel_preproduction_sample(
        db, "trial-rejected", "Quality rejection; discard the trial sample.",
        actor_user={"active": True, "role": "worker", "commercial_permissions": ["commercial.manage_preproduction_samples"]},
        actor_user_id="operator-1",
        cancelled_at=datetime(2026, 11, 3, tzinfo=timezone.utc), session=object(),
    )
    assert result["status"] == "CANCELLED"
    assert db["commercial_preproduction_samples"].rows[0]["cancel_reason"].startswith("Quality rejection")
    assert db["commercial_lots"].rows[0]["status"] == "CANCELLED"
    assert db["commercial_audit_events"].rows[0]["action"] == "PREPRODUCTION_TRIAL_CANCELLED"


@pytest.mark.asyncio
async def test_preproduction_trial_rejects_quantity_above_receiving_balance(monkeypatch):
    db = make_db("10.000")
    async def reserve(*args, **kwargs):
        raise AssertionError("No document number should be reserved")
    async def post(*args, **kwargs):
        raise AssertionError("No stock movement should be posted")
    monkeypatch.setattr(service, "reserve_document_number", reserve)
    monkeypatch.setattr(service, "post_stock_movement", post)

    with pytest.raises(ValueError, match="exceeds the olive quantity available"):
        await service.create_preproduction_sample(
            db, make_draft(), season_code="2627",
            actor_user={"active": True, "role": "admin"}, actor_user_id="admin-1",
            sample_id="sample-2", oil_lot_id="oil-sample-2", movement_id="movement-2",
            movement_audit_id="movement-audit-2",
            created_at=datetime(2026, 11, 3, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_preproduction_samples"].rows == []
