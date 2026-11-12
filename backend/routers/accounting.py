"""Read-only accounting overview scoped to the active olive season.

Financial totals are aggregated from authoritative source documents for the active
season only. Recent-document lists are bounded for display and never drive totals.
"""
from __future__ import annotations

import asyncio
import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import uuid4

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.auth import require_admin
from lib.db import db
from lib.season import active_season, season_prefix

router = APIRouter(prefix="/accounting", tags=["accounting"])
RECENT_LIMIT = 200


def _safe(value: Any) -> Any:
    if isinstance(value, Decimal128):
        return str(value.to_decimal())
    if isinstance(value, dict):
        return {key: _safe(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, list):
        return [_safe(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


async def _recent(
    collection: str, sort_field: str = "created_at",
    limit: int = RECENT_LIMIT, match: dict | None = None,
):
    docs = await db[collection].find(match or {}, {"_id": 0}).sort(sort_field, -1).to_list(limit)
    return _safe(docs)


def _sum_pipeline(field: str, match: dict | None = None) -> list[dict]:
    """Build a Decimal128 aggregation; never route money through binary float."""
    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline.extend([
        {"$group": {"_id": None, "total": {"$sum": {
            "$convert": {"input": f"${field}", "to": "decimal", "onError": 0, "onNull": 0}
        }}}},
        {"$project": {"_id": 0, "total": {"$toString": "$total"}}},
    ])
    return pipeline


async def _sum(collection: str, field: str, match: dict | None = None) -> str:
    """Sum a numeric/Decimal128/string field server-side across matching records."""
    rows = await db[collection].aggregate(_sum_pipeline(field, match)).to_list(1)
    return rows[0]["total"] if rows else "0.000"


@router.get("/overview")
async def accounting_overview(_: dict = Depends(require_admin)):
    """Read-only totals and recent source documents for the active season only."""
    season = await active_season()
    season_code = season_prefix(season)
    commercial_match = {"season_code": season_code}

    # Traditional invoices predate season_code. Their authoritative season is
    # the season_id on the source olive load, so join by its load_id.
    seasonal_load_ids = await db.loads.distinct("id", {"season_id": season})
    invoice_match = {"load_id": {"$in": seasonal_load_ids}}

    (
        invoices, olive_purchases, internal_movements, oil_purchases,
        sales_invoices, sale_payments, oil_payments, credit_notes, suppliers, owners,
        pressing_revenue, pressing_collected, gs_sales_revenue, gs_collected,
        supplier_olive_total, customer_olive_total, customer_olive_paid, customer_oil_total, customer_oil_paid,
    ) = await asyncio.gather(
        _recent("invoices", "day", match=invoice_match),
        _recent("commercial_olive_purchases", match=commercial_match),
        _recent("commercial_internal_movements", match=commercial_match),
        _recent("commercial_oil_purchase_documents", match=commercial_match),
        _recent("commercial_sales_invoices", match=commercial_match),
        _recent("commercial_sale_payments", match=commercial_match),
        _recent("commercial_oil_purchase_payments", match=commercial_match),
        _recent("commercial_credit_notes", match=commercial_match),
        _recent("commercial_suppliers", "name", 1000),
        _recent("commercial_custody_owners", "client_name", 5000),
        _sum("invoices", "total", invoice_match),
        _sum("invoices", "paid_amount", invoice_match),
        _sum("commercial_sales_invoices", "net_amount_dt", commercial_match),
        _sum("commercial_sales_invoices", "paid_amount_dt", commercial_match),
        _sum("commercial_olive_purchases", "total_amount_dt", {**commercial_match, "status": "APPROVED"}),
        _sum("commercial_oil_purchase_documents", "agreed_amount_tnd", {
            **commercial_match, "product_kind": "OLIVE",
        }),
        _sum("commercial_oil_purchase_payments", "amount_tnd", {
            **commercial_match, "product_kind": "OLIVE",
        }),
        _sum("commercial_oil_purchase_documents", "agreed_amount_tnd", {
            **commercial_match,
            "$or": [{"product_kind": "OIL"}, {"product_kind": {"$exists": False}}],
        }),
        _sum("commercial_oil_purchase_payments", "amount_tnd", {
            **commercial_match,
            "$or": [{"product_kind": "OIL"}, {"product_kind": {"$exists": False}}],
        }),
    )
    supplier_names = {str(item.get("id")): item.get("name") for item in suppliers}
    owner_names = {str(item.get("id")): item.get("client_name") for item in owners}
    for purchase in olive_purchases:
        purchase["supplier_name"] = supplier_names.get(str(purchase.get("supplier_id")))
    for movement in internal_movements:
        source_owner = movement.get("source_owner") or {}
        movement["customer_name"] = owner_names.get(str(source_owner.get("customer_id")))

    return {
        "active_season": season,
        "season_code": season_code,
        "traditional_invoices": invoices,
        "supplier_olive_purchases": olive_purchases,
        "customer_ownership_transfers": internal_movements,
        "customer_olive_purchases": [item for item in oil_purchases if item.get("product_kind") == "OLIVE"],
        "customer_oil_purchases": [item for item in oil_purchases if item.get("product_kind", "OIL") == "OIL"],
        "commercial_sales_invoices": sales_invoices,
        "commercial_sale_payments": sale_payments,
        "customer_olive_purchase_payments": [item for item in oil_payments if item.get("product_kind") == "OLIVE"],
        "customer_oil_purchase_payments": [item for item in oil_payments if item.get("product_kind", "OIL") == "OIL"],
        "commercial_credit_notes": credit_notes,
        "suppliers": suppliers,
        "summary": {
            "pressing_revenue_total": pressing_revenue,
            "pressing_collected_total": pressing_collected,
            "gs_sales_revenue_total": gs_sales_revenue,
            "gs_sales_collected_total": gs_collected,
            "supplier_olive_purchase_total": supplier_olive_total,
            "customer_olive_purchase_total": customer_olive_total,
            "customer_olive_paid_total": customer_olive_paid,
            "customer_oil_purchase_total": customer_oil_total,
            "customer_oil_paid_total": customer_oil_paid,
        },
        "recent_limit": RECENT_LIMIT,
        "accounting_basis": "ACTIVE_SEASON_SOURCE_DOCUMENTS_READ_ONLY",
    }


class PassiveIncomeInput(BaseModel):
    income_type: Literal["RENT", "EQUIPMENT_RENTAL", "INTEREST", "INVESTMENT", "OTHER"]
    description: str = Field(min_length=2, max_length=180)
    income_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    amount_tnd: str = Field(pattern=r"^\d{1,12}(?:\.\d{1,3})?$")
    payment_method: Literal["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"] = "CASH"
    notes: str = Field(default="", max_length=500)


@router.get("/passive-incomes")
async def list_passive_incomes(_: dict = Depends(require_admin)):
    season = await active_season()
    rows = await db.accounting_passive_incomes.find(
        {"season": season}, {"_id": 0}
    ).sort([("income_date", -1), ("created_at", -1)]).to_list(1000)
    return _safe(rows)


@router.post("/passive-incomes")
async def create_passive_income(payload: PassiveIncomeInput, user: dict = Depends(require_admin)):
    season = await active_season()
    try:
        datetime.strptime(payload.income_date, "%Y-%m-%d")
        amount = Decimal(payload.amount_tnd)
    except (ValueError, InvalidOperation):
        raise HTTPException(status_code=422, detail="Date ou montant invalide.")
    if not amount.is_finite() or amount <= 0:
        raise HTTPException(status_code=422, detail="Le montant doit être supérieur à zéro.")
    record = {
        "id": str(uuid4()),
        "season": season,
        "income_type": payload.income_type,
        "description": payload.description.strip(),
        "income_date": payload.income_date,
        "amount_tnd": format(amount.quantize(Decimal("0.001")), "f"),
        "payment_method": payload.payment_method,
        "notes": payload.notes.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("id") or user.get("username") or "admin",
    }
    await db.accounting_passive_incomes.insert_one(record)
    record.pop("_id", None)
    return record


@router.delete("/passive-incomes/{income_id}")
async def delete_passive_income(income_id: str, _: dict = Depends(require_admin)):
    season = await active_season()
    result = await db.accounting_passive_incomes.delete_one({"id": income_id, "season": season})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Revenu passif introuvable pour la saison active.")
    return {"ok": True}

class ExpenseInput(BaseModel):
    expense_type: Literal["ELECTRICITY", "WAGES", "MAINTENANCE", "FUEL", "TRANSPORT", "SUPPLIES", "RENT", "INSURANCE", "TAXES", "OTHER"]
    description: str = Field(min_length=2, max_length=180)
    expense_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    amount_tnd: str = Field(pattern=r"^\d{1,12}(?:\.\d{1,3})?$")
    payment_method: Literal["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"] = "CASH"
    beneficiary: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=500)


async def _create_accounting_outflow(collection: str, kind_field: str, kind: str, date_field: str, payload: Any, user: dict):
    season = await active_season()
    try:
        datetime.strptime(getattr(payload, date_field), "%Y-%m-%d")
        amount = Decimal(payload.amount_tnd)
    except (ValueError, InvalidOperation):
        raise HTTPException(status_code=422, detail="Date ou montant invalide.")
    if not amount.is_finite() or amount <= 0:
        raise HTTPException(status_code=422, detail="Le montant doit être supérieur à zéro.")
    record = {
        "id": str(uuid4()),
        "season": season,
        kind_field: kind,
        "description": payload.description.strip(),
        date_field: getattr(payload, date_field),
        "amount_tnd": format(amount.quantize(Decimal("0.001")), "f"),
        "payment_method": payload.payment_method,
        "notes": payload.notes.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.get("id") or user.get("username") or "admin",
    }
    if kind_field == "expense_type":
        record["beneficiary"] = payload.beneficiary.strip()
    else:
        record["supplier"] = payload.supplier.strip()
    await db[collection].insert_one(record)
    record.pop("_id", None)
    return record


async def _list_accounting_outflows(collection: str, date_field: str):
    season = await active_season()
    rows = await db[collection].find({"season": season}, {"_id": 0}).sort(
        [(date_field, -1), ("created_at", -1)]
    ).to_list(1000)
    return _safe(rows)


async def _delete_accounting_outflow(collection: str, record_id: str, kind_label: str):
    season = await active_season()
    result = await db[collection].delete_one({"id": record_id, "season": season})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"{kind_label} introuvable pour la saison active.")
    return {"ok": True}


@router.get("/expenses")
async def list_accounting_expenses(_: dict = Depends(require_admin)):
    return await _list_accounting_outflows("accounting_expenses", "expense_date")


@router.post("/expenses")
async def create_accounting_expense(payload: ExpenseInput, user: dict = Depends(require_admin)):
    return await _create_accounting_outflow("accounting_expenses", "expense_type", payload.expense_type, "expense_date", payload, user)


@router.delete("/expenses/{record_id}")
async def delete_accounting_expense(record_id: str, _: dict = Depends(require_admin)):
    return await _delete_accounting_outflow("accounting_expenses", record_id, "Dépense")


def _accounting_day(value: Any) -> str | None:
    """Normalize timestamps to the mill's business date."""
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZoneInfo("Africa/Tunis")).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value[:10]).isoformat()
        except ValueError:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.astimezone(ZoneInfo("Africa/Tunis")).date().isoformat()
            except ValueError:
                return None
    return None


def _accounting_decimal(value: Any) -> Decimal:
    try:
        amount = value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value if value is not None else "0"))
        return amount if amount.is_finite() else Decimal("0.000")
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0.000")


def _daily_event(events: list[dict], *, day: str | None, category: str,
                 label: str, reference: str, amount: Any, kind: str,
                 detail: str = "") -> None:
    value = _accounting_decimal(amount).quantize(Decimal("0.001"))
    if not day or value == 0:
        return
    events.append({
        "date": day, "category": category, "label": label,
        "reference": reference or "—", "amount": format(value, "f"),
        "kind": kind, "detail": detail,
    })


@router.get("/daily-situation")
async def accounting_daily_situation(
    report_date: str,
    _: dict = Depends(require_admin),
):
    """Daily accrual/cash report from source records; does not mutate accounting data."""
    try:
        selected_day = date.fromisoformat(report_date).isoformat()
    except ValueError:
        raise HTTPException(422, "invalid_report_date")

    season = await active_season()
    season_code = season_prefix(season)
    load_ids = await db.loads.distinct("id", {"season_id": season})
    invoices, supplier_purchases, customer_purchase_docs, sale_invoices, sale_payments, sale_reversals, customer_purchase_payments, passive_incomes, expenses = await asyncio.gather(
        db.invoices.find({"load_id": {"$in": load_ids}}, {"_id": 0}).to_list(None),
        db.commercial_olive_purchases.find({"season_code": season_code, "status": "APPROVED"}, {"_id": 0}).to_list(None),
        db.commercial_oil_purchase_documents.find({"season_code": season_code}, {"_id": 0}).to_list(None),
        db.commercial_sales_invoices.find({"season_code": season_code}, {"_id": 0}).to_list(None),
        db.commercial_sale_payments.find({"season_code": season_code}, {"_id": 0}).to_list(None),
        db.commercial_payment_reversals.find({"season_code": season_code}, {"_id": 0}).to_list(None),
        db.commercial_oil_purchase_payments.find({"season_code": season_code}, {"_id": 0}).to_list(None),
        db.accounting_passive_incomes.find({"season": season}, {"_id": 0}).to_list(None),
        db.accounting_expenses.find({"season": season}, {"_id": 0}).to_list(None),
    )

    events: list[dict] = []
    unallocated_receipts = Decimal("0.000")
    current_receivables = Decimal("0.000")
    current_payables = Decimal("0.000")

    for invoice in invoices:
        invoice_day = _accounting_day(invoice.get("day") or invoice.get("created_at"))
        _daily_event(events, day=invoice_day, category="Prestation", label="Facture de trituration",
                     reference=invoice.get("number", ""), amount=invoice.get("total"), kind="revenue",
                     detail=invoice.get("client_name", ""))
        current_receivables += max(Decimal("0"), _accounting_decimal(invoice.get("balance")))
        known_paid = Decimal("0.000")
        for payment in invoice.get("payments") or []:
            amount = _accounting_decimal(payment.get("amount"))
            payment_day = _accounting_day(payment.get("at") or payment.get("date"))
            if amount > 0 and payment_day:
                _daily_event(events, day=payment_day, category="Prestation", label="Encaissement facture",
                             reference=invoice.get("number", ""), amount=amount, kind="receipt",
                             detail=invoice.get("client_name", ""))
                known_paid += amount
        for history in invoice.get("history") or []:
            if history.get("action") != "updated":
                continue
            before = _accounting_decimal((history.get("before") or {}).get("paid_amount"))
            after = _accounting_decimal((history.get("after") or {}).get("paid_amount"))
            delta = after - before
            history_day = _accounting_day(history.get("at"))
            if delta > 0 and history_day:
                _daily_event(events, day=history_day, category="Prestation", label="Encaissement facture",
                             reference=invoice.get("number", ""), amount=delta, kind="receipt",
                             detail=invoice.get("client_name", ""))
                known_paid += delta
        unallocated_receipts += max(Decimal("0"), _accounting_decimal(invoice.get("paid_amount")) - known_paid)

    for purchase in supplier_purchases:
        purchase_day = _accounting_day(purchase.get("purchase_date") or purchase.get("created_at"))
        amount = _accounting_decimal(purchase.get("total_amount_dt"))
        _daily_event(events, day=purchase_day, category="Achat fournisseur", label="Achat d’olives",
                     reference=purchase.get("document_number", ""), amount=amount, kind="expense",
                     detail=purchase.get("supplier_name", ""))
        # No supplier settlement ledger exists yet; never infer a cash payment.
        current_payables += amount

    for purchase in customer_purchase_docs:
        purchase_day = _accounting_day(purchase.get("purchase_date") or purchase.get("created_at"))
        amount = _accounting_decimal(purchase.get("agreed_amount_tnd"))
        product = "olives" if purchase.get("product_kind") == "OLIVE" else "huile"
        _daily_event(events, day=purchase_day, category="Achat client", label=f"Achat d’{product}",
                     reference=purchase.get("document_number", ""), amount=amount, kind="expense",
                     detail=purchase.get("customer_name", ""))
        current_payables += max(Decimal("0"), _accounting_decimal(purchase.get("outstanding_amount_tnd")))

    for invoice in sale_invoices:
        invoice_day = _accounting_day(invoice.get("sale_date") or invoice.get("created_at"))
        _daily_event(events, day=invoice_day, category="Vente GS", label="Facture de vente d’huile",
                     reference=invoice.get("document_number", ""),
                     amount=invoice.get("net_amount_dt", invoice.get("total_amount_dt")),
                     kind="revenue", detail=invoice.get("buyer_name", ""))
        current_receivables += max(Decimal("0"), _accounting_decimal(invoice.get("outstanding_amount_dt")))

    for reversal in sale_reversals:
        reversal_day = _accounting_day(reversal.get("reversal_date") or reversal.get("created_at"))
        _daily_event(events, day=reversal_day, category="Vente GS", label="Annulation d’encaissement",
                     reference=reversal.get("document_number", ""),
                     amount=-_accounting_decimal(reversal.get("amount_dt")),
                     kind="receipt_adjustment", detail=reversal.get("reason", ""))

    for payment in sale_payments:
        payment_day = _accounting_day(payment.get("payment_date") or payment.get("created_at"))
        _daily_event(events, day=payment_day, category="Vente GS", label="Encaissement facture GS",
                     reference=payment.get("document_number", ""), amount=payment.get("amount_dt"),
                     kind="receipt", detail=payment.get("buyer_name", ""))

    for payment in customer_purchase_payments:
        payment_day = _accounting_day(payment.get("payment_date") or payment.get("created_at"))
        _daily_event(events, day=payment_day, category="Achat client", label="Paiement d’achat",
                     reference=payment.get("document_number", ""), amount=payment.get("amount_tnd"),
                     kind="disbursement", detail=payment.get("customer_name", ""))

    for income in passive_incomes:
        income_day = _accounting_day(income.get("income_date"))
        label = income.get("description", "Revenu complémentaire")
        _daily_event(events, day=income_day, category="Revenu passif", label=label,
                     reference=income.get("id", ""), amount=income.get("amount_tnd"),
                     kind="revenue", detail=income.get("income_type", ""))
        _daily_event(events, day=income_day, category="Revenu passif", label=label,
                     reference=income.get("id", ""), amount=income.get("amount_tnd"),
                     kind="receipt", detail=income.get("payment_method", ""))

    for expense_doc in expenses:
        expense_day = _accounting_day(expense_doc.get("expense_date"))
        label = expense_doc.get("description", "Dépense")
        _daily_event(events, day=expense_day, category="Dépense", label=label,
                     reference=expense_doc.get("id", ""), amount=expense_doc.get("amount_tnd"),
                     kind="expense", detail=expense_doc.get("beneficiary", ""))
        _daily_event(events, day=expense_day, category="Dépense", label=label,
                     reference=expense_doc.get("id", ""), amount=expense_doc.get("amount_tnd"),
                     kind="disbursement", detail=expense_doc.get("payment_method", ""))

    events.sort(key=lambda item: (item["date"], item["category"], item["reference"]))
    day_events = [item for item in events if item["date"] == selected_day]

    def total_for(items: list[dict], kind: str) -> Decimal:
        return sum((_accounting_decimal(item["amount"]) for item in items if item["kind"] == kind), Decimal("0.000"))

    revenue = total_for(day_events, "revenue")
    expense = total_for(day_events, "expense")
    receipts = total_for(day_events, "receipt") + total_for(day_events, "receipt_adjustment")
    disbursements = total_for(day_events, "disbursement")
    selected = date.fromisoformat(selected_day)
    comparison = []
    for offset in range(6, -1, -1):
        day = (selected - timedelta(days=offset)).isoformat()
        rows = [item for item in events if item["date"] == day]
        day_revenue, day_expense = total_for(rows, "revenue"), total_for(rows, "expense")
        comparison.append({
            "date": day, "revenue": format(day_revenue, "f"),
            "expense": format(day_expense, "f"), "net": format(day_revenue - day_expense, "f"),
        })

    return {
        "date": selected_day, "season": season,
        "summary": {
            "total_revenue": format(revenue, "f"),
            "total_expenses": format(expense, "f"),
            "net_result": format(revenue - expense, "f"),
            "encaissements": format(receipts, "f"),
            "decaissements": format(disbursements, "f"),
            "current_receivables": format(current_receivables, "f"),
            "current_payables": format(current_payables, "f"),
            "unallocated_legacy_receipts": format(unallocated_receipts, "f"),
        },
        "events": day_events, "comparison": comparison,
        "accounting_basis": "SOURCE_DOCUMENTS_ACCRUAL_AND_CASH",
        "supplier_payments_available": False,
    }
