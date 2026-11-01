"""Regression tests for automatic invoice creation during load completion."""
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import loads as load_routes


class FakeLoads:
    def __init__(self, doc):
        self.doc = deepcopy(doc)

    async def find_one(self, query, projection=None):
        if self.doc.get("id") != query.get("id"):
            return None
        return deepcopy(self.doc)

    async def find_one_and_update(self, query, update, projection=None, return_document=None):
        if self.doc.get("id") != query.get("id"):
            return None
        if self.doc.get("oil_kg") is not None or self.doc.get("cancelled") or self.doc.get("delivered"):
            return None
        self.doc.update(update.get("$set", {}))
        return deepcopy(self.doc)


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
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
    }
    fake_loads = FakeLoads(doc)
    monkeypatch.setattr(load_routes, "db", SimpleNamespace(loads=fake_loads))
    monkeypatch.setattr(load_routes, "_labs_for", _empty_labs)
    monkeypatch.setattr(load_routes, "to_load", lambda saved, user, lab=None: deepcopy(saved))
    return fake_loads


async def _empty_labs(_ids):
    return {}


@pytest.mark.asyncio
async def test_invoice_is_created_even_if_ready_sms_raises(load_env, monkeypatch):
    calls = []

    async def create_invoice(body, user):
        calls.append(body["load_id"])
        return {"id": "invoice-test"}

    async def fail_sms(_load, _kind):
        raise RuntimeError("SMS provider/logging unavailable")

    monkeypatch.setattr(load_routes, "create_load_invoice", create_invoice)
    monkeypatch.setattr(load_routes, "send_load_sms", fail_sms)

    result = await load_routes.set_oil(
        "load-retry-test", SimpleNamespace(oil_kg=15.0), {"username": "worker", "role": "employee"}
    )

    assert result["oil_kg"] == 15.0
    assert calls == ["load-retry-test"]
    assert load_env.doc["oil_kg"] == 15.0


@pytest.mark.asyncio
async def test_same_oil_retry_repairs_invoice_without_resending_sms(load_env, monkeypatch):
    load_env.doc["oil_kg"] = 15.0
    invoice_calls = []
    sms_calls = []

    async def create_invoice(body, user):
        invoice_calls.append(body["load_id"])
        return {"id": "invoice-test"}

    async def send_sms(_load, _kind):
        sms_calls.append(True)

    monkeypatch.setattr(load_routes, "create_load_invoice", create_invoice)
    monkeypatch.setattr(load_routes, "send_load_sms", send_sms)

    result = await load_routes.set_oil(
        "load-retry-test", SimpleNamespace(oil_kg=15.0), {"username": "worker", "role": "employee"}
    )

    assert result["oil_kg"] == 15.0
    assert invoice_calls == ["load-retry-test"]
    assert sms_calls == []


@pytest.mark.asyncio
async def test_same_oil_retry_propagates_invoice_failure_for_later_retry(load_env, monkeypatch):
    load_env.doc["oil_kg"] = 15.0

    async def fail_invoice(_body, _user):
        raise RuntimeError("temporary database failure")

    monkeypatch.setattr(load_routes, "create_load_invoice", fail_invoice)
    monkeypatch.setattr(load_routes, "send_load_sms", lambda *_args: pytest.fail("SMS must not run"))

    with pytest.raises(RuntimeError, match="temporary database failure"):
        await load_routes.set_oil(
            "load-retry-test", SimpleNamespace(oil_kg=15.0), {"username": "worker", "role": "employee"}
        )


@pytest.mark.asyncio
async def test_different_oil_value_still_cannot_overwrite_completed_load(load_env, monkeypatch):
    load_env.doc["oil_kg"] = 15.0

    async def unexpected(*_args):
        pytest.fail("invoice should not be attempted for a conflicting oil value")

    monkeypatch.setattr(load_routes, "create_load_invoice", unexpected)

    with pytest.raises(HTTPException) as exc:
        await load_routes.set_oil(
            "load-retry-test", SimpleNamespace(oil_kg=16.0), {"username": "worker", "role": "employee"}
        )

    assert exc.value.status_code == 409
    assert load_env.doc["oil_kg"] == 15.0

@pytest.mark.asyncio
async def test_existing_invoice_conflict_is_treated_as_success(load_env, monkeypatch):
    async def duplicate_invoice(_body, _user):
        raise HTTPException(409, "load_already_invoiced")

    monkeypatch.setattr(load_routes, "create_load_invoice", duplicate_invoice)
    await load_routes._ensure_load_invoice("load-retry-test", {"username": "worker"})


@pytest.mark.asyncio
async def test_unrelated_conflict_is_not_swallowed(load_env, monkeypatch):
    async def unrelated_conflict(_body, _user):
        raise HTTPException(409, "invoice_state_conflict")

    monkeypatch.setattr(load_routes, "create_load_invoice", unrelated_conflict)
    with pytest.raises(HTTPException) as exc:
        await load_routes._ensure_load_invoice("load-retry-test", {"username": "worker"})

    assert exc.value.status_code == 409
    assert exc.value.detail == "invoice_state_conflict"

