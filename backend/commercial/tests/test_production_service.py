from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from commercial.schemas.production import CommercialProductionDraft
from commercial.services import production as service


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def find_one(self, query, projection=None, session=None):
        return next((row for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, row, session=None):
        self.rows.append(dict(row))
        return SimpleNamespace(inserted_id=row.get("id"))

    async def update_one(self, query, update, session=None):
        row = next((row for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)
        if row is None:
            return SimpleNamespace(matched_count=0)
        row.update(update.get("$set", {}))
        return SimpleNamespace(matched_count=1)


class Database:
    def __init__(self, collections):
        self.collections = collections

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())


def make_draft():
    return CommercialProductionDraft(
        production_date=date(2026, 11, 2),
        inputs=[
            {"olive_lot_id": "olive-1", "source_location_id": "yard-1",
             "owner": {"kind": "MILL"}, "quantity_kg": "500"},
            {"olive_lot_id": "olive-2", "source_location_id": "yard-1",
             "owner": {"kind": "MILL"}, "quantity_kg": "500"},
        ],
        actual_oil_output_kg="180.500",
        output_tank_id="tank-01",
        idempotency_key="production-service-test-0001",
    )

def approved_lot(lot_id):
    return {
        "id": lot_id, "product_kind": "OLIVE", "owner": {"kind": "MILL"}, "status": "OPEN",
        "preproduction_quality_status": "RELEASED",
        "preproduction_sample_id": f"sample-{lot_id}",
        "preproduction_quality_assessment_id": f"assessment-{lot_id}",
    }


def approved_quality_rows(lot_ids):
    samples = [{"id": f"sample-{lot_id}", "source_olive_lot_id": lot_id,
                "oil_sample_lot_id": f"sample-oil-{lot_id}", "status": "COMPLETED"} for lot_id in lot_ids]
    assessments = [{"id": f"assessment-{lot_id}", "oil_lot_id": f"sample-oil-{lot_id}",
                    "status": "REVIEWED", "decision": "RELEASED"} for lot_id in lot_ids]
    return samples, assessments



@pytest.mark.asyncio
async def test_production_posts_olive_consumption_and_oil_receipt(monkeypatch):
    db = Database({
        "commercial_production_runs": Collection(),
        "commercial_lots": Collection([approved_lot("olive-1"), approved_lot("olive-2")]),
        "commercial_preproduction_samples": Collection(approved_quality_rows(["olive-1", "olive-2"])[0]),
        "commercial_quality_assessments": Collection(approved_quality_rows(["olive-1", "olive-2"])[1]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": True}]),
        "commercial_audit_events": Collection(),
    })
    counters = {"PROD": 0, "LOT": 0}
    async def reserve(_collection, _season, doc_type, *, session):
        counters[doc_type] += 1
        return f"2627{doc_type}{counters[doc_type]:04d}"
    posted = []
    async def post(_db, movement, **kwargs):
        posted.append(movement)
        return {"id": kwargs["movement_id"]}
    monkeypatch.setattr(service, "reserve_document_number", reserve)
    monkeypatch.setattr(service, "post_stock_movement", post)

    result = await service.complete_commercial_production(
        db, make_draft(), season_code="2627",
        actor_user={"active": True, "role": "admin"},
        actor_user_id="admin-1", production_id="production-1",
        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
    )
    assert result["document_number"] == "2627PROD0001"
    assert result["status"] == "COMPLETED"
    assert result["total_olive_input_kg"].to_decimal() == Decimal("1000")
    assert result["actual_oil_output_kg"].to_decimal() == Decimal("180.500")
    assert [item.movement_kind for item in posted] == ["CONSUMPTION", "CONSUMPTION", "RECEIPT"]
    assert all(item.source_document_type == "PROD" for item in posted)
    oil_lot = db["commercial_lots"].rows[-1]
    assert oil_lot["product_kind"] == "OIL"
    assert oil_lot["owner"] == {"kind": "MILL"}
    assert oil_lot["quality_status"] == "PENDING"


@pytest.mark.asyncio
async def test_production_idempotency_returns_existing_run_without_reposting(monkeypatch):
    db = Database({
        "commercial_production_runs": Collection(),
        "commercial_lots": Collection([approved_lot("olive-1"), approved_lot("olive-2")]),
        "commercial_preproduction_samples": Collection(approved_quality_rows(["olive-1", "olive-2"])[0]),
        "commercial_quality_assessments": Collection(approved_quality_rows(["olive-1", "olive-2"])[1]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": True}]),
        "commercial_audit_events": Collection(),
    })
    async def reserve(_collection, _season, doc_type, *, session):
        return f"2627{doc_type}0001"
    calls = []
    async def post(_db, movement, **kwargs):
        calls.append(movement)
    monkeypatch.setattr(service, "reserve_document_number", reserve)
    monkeypatch.setattr(service, "post_stock_movement", post)
    args = dict(
        season_code="2627", actor_user={"active": True, "role": "admin"},
        actor_user_id="admin-1", created_at=datetime(2026, 11, 2, tzinfo=timezone.utc),
        session=object(),
    )
    first = await service.complete_commercial_production(
        db, make_draft(), production_id="production-1", **args
    )
    second = await service.complete_commercial_production(
        db, make_draft(), production_id="different-retry-id", **args
    )
    assert first["id"] == second["id"] == "production-1"
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_production_rejects_olive_lot_without_preproduction_release():
    db = Database({
        "commercial_production_runs": Collection(),
        "commercial_lots": Collection([
            {"id": "olive-1", "product_kind": "OLIVE", "owner": {"kind": "MILL"}, "status": "OPEN"},
        ]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": True}]),
    })
    draft = CommercialProductionDraft(
        production_date="2026-11-02",
        inputs=[{
            "olive_lot_id": "olive-1", "source_location_id": "yard-1",
            "owner": {"kind": "MILL"}, "quantity_kg": "100",
        }],
        actual_oil_output_kg="20", output_tank_id="tank-01",
        idempotency_key="production-quality-gate-test-0001",
    )
    with pytest.raises(ValueError, match="Preproduction quality approval is required"):
        await service.complete_commercial_production(
            db, draft, season_code="2627",
            actor_user={"active": True, "role": "admin"},
            actor_user_id="admin-1", production_id="production-gate",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_production_runs"].rows == []


@pytest.mark.asyncio
async def test_production_rejects_owner_mismatch_before_creating_run():
    db = Database({
        "commercial_production_runs": Collection(),
        "commercial_lots": Collection([
            {"id": "olive-1", "product_kind": "OLIVE",
             "owner": {"kind": "CUSTOMER", "customer_id": "client-1"}, "status": "OPEN"},
        ]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": True}]),
    })
    draft = CommercialProductionDraft(
        production_date="2026-11-02",
        inputs=[{
            "olive_lot_id": "olive-1", "source_location_id": "yard-1",
            "owner": {"kind": "MILL"}, "quantity_kg": "500",
        }],
        actual_oil_output_kg="100", output_tank_id="tank-01",
        idempotency_key="production-owner-test-0001",
    )
    with pytest.raises(ValueError, match="ownership mismatch"):
        await service.complete_commercial_production(
            db, draft, season_code="2627",
            actor_user={"active": True, "role": "admin"},
            actor_user_id="admin-1", production_id="production-2",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_production_runs"].rows == []


@pytest.mark.asyncio
async def test_production_rejects_quarantine_output_tank_before_creating_run():
    db = Database({
        "commercial_production_runs": Collection(),
        "commercial_lots": Collection([approved_lot("olive-1"), approved_lot("olive-2")]),
        "commercial_preproduction_samples": Collection(approved_quality_rows(["olive-1", "olive-2"])[0]),
        "commercial_quality_assessments": Collection(approved_quality_rows(["olive-1", "olive-2"])[1]),
        "commercial_tanks": Collection([{"id": "tank-01", "active": True, "role": "QUARANTINE"}]),
        "commercial_audit_events": Collection(),
    })
    with pytest.raises(ValueError, match="normal storage tank"):
        await service.complete_commercial_production(
            db, make_draft(), season_code="2627",
            actor_user={"active": True, "role": "admin"},
            actor_user_id="admin-1", production_id="production-quarantine",
            created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=object(),
        )
    assert db["commercial_production_runs"].rows == []
