import pytest
from fastapi import HTTPException
from types import SimpleNamespace

from routers import loads


class FakeInvoices:
    def __init__(self, invoice=None):
        self.invoice = invoice

    async def find_one(self, query, projection=None):
        return self.invoice


@pytest.mark.asyncio
async def test_load_delete_guard_rejects_load_with_invoice(monkeypatch):
    fake = SimpleNamespace(invoices=FakeInvoices({"number": "FAC-2627100"}))
    monkeypatch.setattr(loads, "db", fake)

    with pytest.raises(HTTPException) as exc:
        await loads._ensure_load_has_no_invoice("load-1")

    assert exc.value.status_code == 409
    assert exc.value.detail == "load_has_invoice"


@pytest.mark.asyncio
async def test_load_delete_guard_allows_load_without_invoice(monkeypatch):
    fake = SimpleNamespace(invoices=FakeInvoices())
    monkeypatch.setattr(loads, "db", fake)

    await loads._ensure_load_has_no_invoice("load-1")
