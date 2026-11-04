from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from lib import db as db_module
from routers import extras, invoices, loads


class FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def with_transaction(self, operation):
        return await operation(self)


class FakeClient:
    async def start_session(self):
        return FakeSession()


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _length):
        return list(self.docs)


class FakeAuditEvents:
    def __init__(self, calls=None):
        self.calls = calls if calls is not None else []
        self.events = []

    async def insert_one(self, event, **kwargs):
        assert kwargs.get("session") is not None
        self.calls.append("audit-event")
        self.events.append(dict(event))


@pytest.mark.asyncio
async def test_run_transaction_uses_session_with_transaction(monkeypatch):
    monkeypatch.setattr(db_module, "client", FakeClient())
    seen = []

    async def operation(session):
        seen.append(session)
        return "committed"

    result = await db_module.run_transaction(operation)

    assert result == "committed"
    assert len(seen) == 1


@pytest.mark.asyncio
async def test_invoice_creation_writes_source_load_and_invoice_in_same_session(monkeypatch):
    session = object()
    load = {
        "id": "load-1", "code": "2627101", "client_name": "Test client",
        "phone": "21600000000", "olive_kg": 100.0, "oil_kg": 20.0,
        "day": "2026-11-01", "cancelled": False,
    }

    class Loads:
        async def find_one(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            return dict(load)

        async def update_one(self, query, update, **kwargs):
            assert kwargs["session"] is session
            assert query["id"] == "load-1"
            assert update == {"$inc": {"invoice_guard_version": 1}}
            return SimpleNamespace(matched_count=1)

    class Invoices:
        async def find_one(self, query, **kwargs):
            assert kwargs["session"] is session
            return None

        async def insert_one(self, doc, **kwargs):
            assert kwargs["session"] is session
            self.inserted = doc

    class AuditEvents(FakeAuditEvents):
        async def insert_one(self, event, **kwargs):
            assert kwargs["session"] is session
            self.events.append(dict(event))

    class Settings:
        async def find_one(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            return {"price_per_kg": 1.5, "mill_name": "Test mill"}

    fake_invoices = Invoices()
    monkeypatch.setattr(invoices, "db", SimpleNamespace(
        loads=Loads(), invoices=fake_invoices, settings=Settings(),
        commercial_audit_events=AuditEvents(),
    ))

    result = await invoices._create_invoice_in_session(
        {"load_id": "load-1", "paid_amount": 0},
        {"username": "admin"},
        session,
    )

    assert result["number"] == "FAC-2627101"
    assert result["total"] == 30.0
    assert fake_invoices.inserted["load_id"] == "load-1"


@pytest.mark.asyncio
async def test_load_delete_checks_invoice_and_deletes_with_same_session(monkeypatch):
    session = object()
    calls = []

    class Invoices:
        async def find_one(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            calls.append("invoice-check")
            return None

    class Loads:
        async def find_one(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            calls.append("load-read")
            return {"id": query["id"], "code": "2627101", "client_name": "Client", "olive_kg": 100}

        async def delete_one(self, query, **kwargs):
            assert kwargs["session"] is session
            calls.append("load-delete")
            return SimpleNamespace(deleted_count=1)

    class Lab:
        async def delete_many(self, query, **kwargs):
            assert kwargs["session"] is session
            calls.append("lab-delete")

    async def run(operation):
        return await operation(session)

    monkeypatch.setattr(loads, "db", SimpleNamespace(
        invoices=Invoices(), loads=Loads(), lab=Lab(),
        commercial_audit_events=FakeAuditEvents(calls),
    ))
    monkeypatch.setattr(loads, "run_transaction", run)

    result = await loads.delete_load("load-1", {})

    assert result == {"ok": True}
    assert calls == ["invoice-check", "load-read", "load-delete", "lab-delete", "audit-event"]


@pytest.mark.asyncio
async def test_client_delete_checks_invoice_before_any_deletion(monkeypatch):
    session = object()
    calls = []

    class Loads:
        def find(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            return FakeCursor([{"id": "load-1"}])

        async def delete_many(self, query, **kwargs):
            assert kwargs["session"] is session
            calls.append("loads-delete")
            return SimpleNamespace(deleted_count=1)

    class Invoices:
        async def find_one(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            calls.append("invoice-check")
            return {"number": "FAC-2627101"}

    class Clients:
        async def delete_one(self, query, **kwargs):
            calls.append("client-delete")
            return SimpleNamespace(deleted_count=1)

    class Related:
        async def delete_many(self, query, **kwargs):
            calls.append("related-delete")

    async def run(operation):
        return await operation(session)

    monkeypatch.setattr(extras, "db", SimpleNamespace(
        loads=Loads(), invoices=Invoices(), clients=Clients(),
        lab=Related(), sms_log=Related()
    ))
    monkeypatch.setattr(extras, "run_transaction", run)

    with pytest.raises(HTTPException) as exc:
        await extras.delete_client("21600000000", {})

    assert exc.value.status_code == 409
    assert exc.value.detail == "client_has_invoices"
    assert calls == ["invoice-check"]


@pytest.mark.asyncio
async def test_client_delete_groups_all_deletes_in_one_transaction(monkeypatch):
    session = object()
    calls = []

    class Loads:
        def find(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            return FakeCursor([{"id": "load-1"}])

        async def delete_many(self, query, **kwargs):
            assert kwargs["session"] is session
            calls.append("loads")
            return SimpleNamespace(deleted_count=1)

    class Invoices:
        async def find_one(self, query, projection=None, **kwargs):
            assert kwargs["session"] is session
            return None

    class Clients:
        async def delete_one(self, query, **kwargs):
            assert kwargs["session"] is session
            calls.append("client")
            return SimpleNamespace(deleted_count=1)

    class Related:
        async def delete_many(self, query, **kwargs):
            assert kwargs["session"] is session
            calls.append("related")

    async def run(operation):
        return await operation(session)

    monkeypatch.setattr(extras, "db", SimpleNamespace(
        loads=Loads(), invoices=Invoices(), clients=Clients(),
        lab=Related(), sms_log=Related()
    ))
    monkeypatch.setattr(extras, "run_transaction", run)

    result = await extras.delete_client("21600000000", {})

    assert result.deleted == 1
    assert calls == ["client", "related", "related", "loads"]
