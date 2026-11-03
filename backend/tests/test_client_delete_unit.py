import pytest
from fastapi import HTTPException
from types import SimpleNamespace

from routers import extras


class FakeInvoices:
    def __init__(self, invoice=None):
        self.invoice = invoice
        self.last_query = None

    async def find_one(self, query, projection=None):
        self.last_query = query
        return self.invoice


@pytest.mark.asyncio
async def test_client_delete_guard_rejects_loads_with_invoices(monkeypatch):
    fake = SimpleNamespace(invoices=FakeInvoices({"number": "FAC-2627100"}))
    monkeypatch.setattr(extras, "db", fake)

    with pytest.raises(HTTPException) as exc:
        await extras._ensure_client_has_no_invoices(["load-1", "load-2"])

    assert exc.value.status_code == 409
    assert exc.value.detail == "client_has_invoices"
    assert fake.invoices.last_query == {"load_id": {"$in": ["load-1", "load-2"]}}


@pytest.mark.asyncio
async def test_client_delete_guard_allows_loads_without_invoices(monkeypatch):
    fake = SimpleNamespace(invoices=FakeInvoices())
    monkeypatch.setattr(extras, "db", fake)

    await extras._ensure_client_has_no_invoices(["load-1"])


@pytest.mark.asyncio
async def test_client_delete_guard_skips_invoice_lookup_without_loads(monkeypatch):
    fake = SimpleNamespace(invoices=FakeInvoices())
    monkeypatch.setattr(extras, "db", fake)

    await extras._ensure_client_has_no_invoices([])

    assert fake.invoices.last_query is None
