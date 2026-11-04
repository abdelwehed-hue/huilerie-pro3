"""Regression tests for transactional load completion and automatic invoices."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import loads as load_routes


class FakeSession:
    pass


class FakeLoads:
    def __init__(self, doc):
        self.doc = deepcopy(doc)
        self.update_session = None

    async def find_one(self, query, projection=None, **kwargs):
        assert kwargs.get("session") is not None
        if self.doc.get("id") != query.get("id"):
            return None
        return deepcopy(self.doc)

    async def find_one_and_update(
        self, query, update, projection=None, return_document=None, **kwargs
    ):
        self.update_session = kwargs.get("session")
        assert self.update_session is not None
        if self.doc.get("id") != query.get("id"):
            return None
        if self.doc.get("oil_kg") is not None or self.doc.get("cancelled") or self.doc.get("delivered"):
            return None
        self.doc.update(update.get("$set", {}))
        return deepcopy(self.doc)


class FakeAuditEvents:
    def __init__(self):
        self.events = []

    async def insert_one(self, event, **kwargs):
        assert kwargs.get("session") is not None
        self.events.append(deepcopy(event))


class FakeInvoices:
    def __init__(self, existing=False):
        self.existing = existing
        self.lookup_session = None

    async def find_one(self, query, **kwargs):
        self.lookup_session = kwargs.get("session")
        assert self.lookup_session is not None
        return {"id": "invoice-existing"} if self.existing else None


@pytest.fixture
def load_env(monkeypatch):
    doc = {
        "id": "load-retry-test",
        "code": "2627999",
        "client_name": "Client test",
        "phone": "21600000000",
        "olive_kg": 100.0,
        "oil_kg": None,
        "day": "2026-11-01",
        "created_by": "worker",
        "created_at": datetime.now(timezone.utc),
    }
    fake_loads = FakeLoads(doc)
    fake_invoices = FakeInvoices()
    fake_audit = FakeAuditEvents()
    session = FakeSession()

    async def run_transaction(operation):
        return await operation(session)

    monkeypatch.setattr(
        load_routes, "db",
        SimpleNamespace(loads=fake_loads, invoices=fake_invoices, commercial_audit_events=fake_audit),
    )
    monkeypatch.setattr(load_routes, "run_transaction", run_transaction)
    monkeypatch.setattr(load_routes, "_labs_for", _empty_labs)
    monkeypatch.setattr(load_routes, "to_load", lambda saved, user, lab=None: deepcopy(saved))
    return SimpleNamespace(loads=fake_loads, invoices=fake_invoices, audit=fake_audit, session=session)


async def _empty_labs(_ids):
    return {}


@pytest.mark.asyncio
async def test_first_completion_updates_load_and_creates_invoice_in_same_session(load_env, monkeypatch):
    calls = []

    async def create_invoice(body, user, session):
        calls.append((body["load_id"], session))
        assert session is load_env.session
        assert load_env.loads.update_session is session
        return {"id": "invoice-test"}

    async def fail_sms(_load, _kind):
        raise RuntimeError("SMS provider/logging unavailable")

    monkeypatch.setattr(load_routes, "_create_invoice_in_session", create_invoice)
    monkeypatch.setattr(load_routes, "send_load_sms", fail_sms)

    result = await load_routes.set_oil(
        "load-retry-test", SimpleNamespace(oil_kg=15.0),
        {"username": "worker", "role": "employee"},
    )

    assert result["oil_kg"] == 15.0
    assert calls == [("load-retry-test", load_env.session)]
    assert len(load_env.audit.events) == 1
    assert load_env.audit.events[0]["action"] == "LOAD_OIL_RECORDED"
    assert load_env.loads.doc["oil_kg"] == 15.0


@pytest.mark.asyncio
async def test_same_oil_retry_repairs_missing_invoice_without_resending_sms(load_env, monkeypatch):
    load_env.loads.doc["oil_kg"] = 15.0
    calls = []
    sms_calls = []

    async def create_invoice(body, user, session):
        calls.append((body["load_id"], session))
        return {"id": "invoice-test"}

    async def send_sms(*_args):
        sms_calls.append(True)

    monkeypatch.setattr(load_routes, "_create_invoice_in_session", create_invoice)
    monkeypatch.setattr(load_routes, "send_load_sms", send_sms)

    result = await load_routes.set_oil(
        "load-retry-test", SimpleNamespace(oil_kg=15.0),
        {"username": "worker", "role": "employee"},
    )

    assert result["oil_kg"] == 15.0
    assert calls == [("load-retry-test", load_env.session)]
    assert sms_calls == []


@pytest.mark.asyncio
async def test_same_oil_retry_skips_invoice_when_already_present(load_env, monkeypatch):
    load_env.loads.doc["oil_kg"] = 15.0
    load_env.invoices.existing = True

    async def unexpected(*_args):
        pytest.fail("existing invoice must not be duplicated")

    monkeypatch.setattr(load_routes, "_create_invoice_in_session", unexpected)
    monkeypatch.setattr(
        load_routes, "send_load_sms",
        lambda *_args: pytest.fail("same-value retry must not resend SMS"),
    )

    result = await load_routes.set_oil(
        "load-retry-test", SimpleNamespace(oil_kg=15.0),
        {"username": "worker", "role": "employee"},
    )

    assert result["oil_kg"] == 15.0
    assert load_env.invoices.lookup_session is load_env.session


@pytest.mark.asyncio
async def test_invoice_failure_propagates_from_completion_transaction(load_env, monkeypatch):
    async def fail_invoice(_body, _user, _session):
        raise RuntimeError("temporary database failure")

    monkeypatch.setattr(load_routes, "_create_invoice_in_session", fail_invoice)
    monkeypatch.setattr(
        load_routes, "send_load_sms",
        lambda *_args: pytest.fail("SMS must not run when invoice transaction fails"),
    )

    with pytest.raises(RuntimeError, match="temporary database failure"):
        await load_routes.set_oil(
            "load-retry-test", SimpleNamespace(oil_kg=15.0),
            {"username": "worker", "role": "employee"},
        )


@pytest.mark.asyncio
async def test_different_oil_value_cannot_overwrite_completed_load(load_env, monkeypatch):
    load_env.loads.doc["oil_kg"] = 15.0

    async def unexpected(*_args):
        pytest.fail("invoice must not be attempted for a conflicting oil value")

    monkeypatch.setattr(load_routes, "_create_invoice_in_session", unexpected)

    with pytest.raises(HTTPException) as exc:
        await load_routes.set_oil(
            "load-retry-test", SimpleNamespace(oil_kg=16.0),
            {"username": "worker", "role": "employee"},
        )

    assert exc.value.status_code == 409
    assert load_env.loads.doc["oil_kg"] == 15.0


@pytest.mark.asyncio
async def test_completion_rejects_cancelled_or_delivered_load(load_env, monkeypatch):
    load_env.loads.doc["cancelled"] = True
    with pytest.raises(HTTPException) as exc:
        await load_routes.set_oil(
            "load-retry-test", SimpleNamespace(oil_kg=15.0),
            {"username": "worker", "role": "employee"},
        )
    assert exc.value.status_code == 409
