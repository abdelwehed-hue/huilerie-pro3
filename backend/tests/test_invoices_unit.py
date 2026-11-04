"""Isolated unit tests for invoice business rules; never connect to a real database."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import invoices as invoice_routes


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, projection=None, **kwargs):
        for doc in self.docs:
            if all(
                doc.get(key) != value["$ne"] if isinstance(value, dict) and "$ne" in value
                else doc.get(key) == value
                for key, value in query.items()
            ):
                return dict(doc)
        return None

    async def insert_one(self, doc, **kwargs):
        self.docs.append(dict(doc))
        return SimpleNamespace(inserted_id="fake-id")

    async def update_one(self, query, update, **kwargs):
        for doc in self.docs:
            if all(
                doc.get(key) != value["$ne"] if isinstance(value, dict) and "$ne" in value
                else doc.get(key) == value
                for key, value in query.items()
            ):
                doc.update(update.get("$set", {}))
                for key, value in update.get("$push", {}).items():
                    doc.setdefault(key, []).append(value)
                for key, value in update.get("$inc", {}).items():
                    doc[key] = doc.get(key, 0) + value
                return SimpleNamespace(modified_count=1, matched_count=1)
        return SimpleNamespace(modified_count=0, matched_count=0)


@pytest.fixture
def fake_db(monkeypatch):
    load = {
        "id": "load-test-1",
        "code": "2627100",
        "client_name": "Client test",
        "phone": "555-0100",
        "olive_kg": 100.0,
        "oil_kg": 15.0,
        "day": "2026-10-27",
        "cancelled": False,
    }
    fake = SimpleNamespace(
        loads=FakeCollection([load]),
        settings=FakeCollection([{"key": "app", "price_per_kg": 0.18}]),
        invoices=FakeCollection(),
        commercial_audit_events=FakeCollection(),
    )
    monkeypatch.setattr(invoice_routes, "db", fake)

    async def fake_transaction(operation):
        return await operation(object())

    monkeypatch.setattr(invoice_routes, "run_transaction", fake_transaction)
    return fake


@pytest.mark.asyncio
async def test_create_invoice_calculates_total_and_balance(fake_db):
    result = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0.5},
        {"username": "admin"},
    )

    assert result["total"] == 2.7
    assert result["paid_amount"] == 0.5
    assert result["balance"] == 2.2
    assert result["load_code"] == "2627100"
    assert result["number"] == "FAC-2627100"
    assert len(result["history"]) == 1
    assert result["history"][0]["after"]["balance"] == 2.2


@pytest.mark.asyncio
async def test_duplicate_invoice_for_same_load_is_rejected(fake_db):
    await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0},
        {"username": "admin"},
    )

    with pytest.raises(HTTPException) as exc:
        await invoice_routes.create_invoice(
            {"load_id": "load-test-1", "paid_amount": 0},
            {"username": "admin"},
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_update_recalculates_balance_and_records_history(fake_db):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0.5},
        {"username": "admin"},
    )

    updated = await invoice_routes.update_invoice(
        created["id"],
        {"price_per_kg": 0.2, "paid_amount": 1.0},
        {"username": "admin"},
    )

    assert updated["total"] == 3.0
    assert updated["paid_amount"] == 1.0
    assert updated["balance"] == 2.0
    assert len(updated["history"]) == 2
    assert updated["history"][-1]["action"] == "updated"
    assert updated["history"][-1]["before"]["balance"] == 2.2
    assert updated["history"][-1]["after"]["balance"] == 2.0
    assert len(fake_db.commercial_audit_events.docs) == 2
    assert fake_db.commercial_audit_events.docs[-1]["action"] == "INVOICE_UPDATED"
    assert fake_db.commercial_audit_events.docs[-1]["details"]["previous_values"]["balance"] == 2.2


@pytest.mark.asyncio
async def test_paid_amount_cannot_exceed_total(fake_db):
    with pytest.raises(HTTPException) as exc:
        await invoice_routes.create_invoice(
            {"load_id": "load-test-1", "paid_amount": 2.71},
            {"username": "admin"},
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_invoice_keeps_price_snapshot_when_settings_change(fake_db):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0},
        {"username": "admin"},
    )

    fake_db.settings.docs[0]["price_per_kg"] = 0.25

    assert created["price_per_kg"] == 0.18
    assert created["total"] == 2.7
    assert fake_db.invoices.docs[0]["price_per_kg"] == 0.18


@pytest.mark.asyncio
async def test_cancelled_load_cannot_be_invoiced(fake_db):
    fake_db.loads.docs[0]["cancelled"] = True

    with pytest.raises(HTTPException) as exc:
        await invoice_routes.create_invoice(
            {"load_id": "load-test-1", "paid_amount": 0},
            {"username": "admin"},
        )

    assert exc.value.status_code == 400
    assert not fake_db.invoices.docs


@pytest.mark.asyncio
async def test_non_finite_price_update_is_rejected_without_changing_invoice(fake_db):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0},
        {"username": "admin"},
    )

    with pytest.raises(HTTPException) as exc:
        await invoice_routes.update_invoice(
            created["id"],
            {"price_per_kg": float("nan"), "paid_amount": 0},
            {"username": "admin"},
        )

    assert exc.value.status_code == 422
    assert fake_db.invoices.docs[0]["price_per_kg"] == 0.18
    assert len(fake_db.invoices.docs[0]["history"]) == 1


@pytest.mark.asyncio
async def test_update_rejects_payment_above_recalculated_total(fake_db):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0},
        {"username": "admin"},
    )

    with pytest.raises(HTTPException) as exc:
        await invoice_routes.update_invoice(
            created["id"],
            {"price_per_kg": 0.1, "paid_amount": 11},
            {"username": "admin"},
        )

    assert exc.value.status_code == 422
    assert fake_db.invoices.docs[0]["price_per_kg"] == 0.18
    assert fake_db.invoices.docs[0]["paid_amount"] == 0
    assert len(fake_db.invoices.docs[0]["history"]) == 1


@pytest.mark.asyncio
async def test_negative_payment_is_rejected(fake_db):
    with pytest.raises(HTTPException) as exc:
        await invoice_routes.create_invoice(
            {"load_id": "load-test-1", "paid_amount": -1},
            {"username": "admin"},
        )

    assert exc.value.status_code == 422
    assert not fake_db.invoices.docs


@pytest.mark.asyncio
async def test_unchanged_invoice_edit_does_not_add_history(fake_db):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0.5},
        {"username": "admin"},
    )

    updated = await invoice_routes.update_invoice(
        created["id"], {"price_per_kg": 0.18, "paid_amount": 0.5}, {"username": "admin"}
    )

    assert updated["total"] == 2.7
    assert updated["balance"] == 2.2
    assert len(updated["history"]) == 1
    assert len(fake_db.commercial_audit_events.docs) == 1


@pytest.mark.asyncio
async def test_update_with_no_editable_fields_is_rejected_without_history_change(fake_db):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0},
        {"username": "admin"},
    )

    with pytest.raises(HTTPException) as exc:
        await invoice_routes.update_invoice(
            created["id"], {"unexpected_field": "ignored"}, {"username": "admin"}
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "no_editable_fields"
    assert len(fake_db.invoices.docs[0]["history"]) == 1


@pytest.mark.asyncio
async def test_concurrent_invoice_edit_is_rejected_without_overwriting_history(fake_db, monkeypatch):
    created = await invoice_routes.create_invoice(
        {"load_id": "load-test-1", "paid_amount": 0.5},
        {"username": "admin"},
    )
    original_update_one = fake_db.invoices.update_one

    async def simulate_concurrent_edit(query, update, **kwargs):
        # Simulate another admin saving the invoice after this request read it.
        fake_db.invoices.docs[0]["updated_at"] = "changed-by-another-edit"
        return await original_update_one(query, update, **kwargs)

    monkeypatch.setattr(fake_db.invoices, "update_one", simulate_concurrent_edit)

    with pytest.raises(HTTPException) as exc:
        await invoice_routes.update_invoice(
            created["id"],
            {"price_per_kg": 0.2, "paid_amount": 0.5},
            {"username": "admin"},
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == "invoice_changed_retry"
    assert fake_db.invoices.docs[0]["price_per_kg"] == 0.18
    assert len(fake_db.invoices.docs[0]["history"]) == 1
