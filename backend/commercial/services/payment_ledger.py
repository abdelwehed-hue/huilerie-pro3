"""Read-only reconciliation helpers for immutable PAY and REV documents."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from bson.decimal128 import Decimal128


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value or "0"))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


async def cash_paid_from_ledger(db: Any, invoice_id: str, *, session: Any) -> Decimal:
    payments = await db["commercial_sale_payments"].find(
        {"invoice_id": invoice_id}, {"_id": 0, "amount_dt": 1}, session=session
    ).to_list(None)
    reversals = await db["commercial_payment_reversals"].find(
        {"invoice_id": invoice_id}, {"_id": 0, "amount_dt": 1}, session=session
    ).to_list(None)
    return _money(
        sum((_decimal(item["amount_dt"]) for item in payments), Decimal("0.000"))
        - sum((_decimal(item["amount_dt"]) for item in reversals), Decimal("0.000"))
    )


async def assert_invoice_cash_paid_reconciles(
    db: Any, invoice_id: str, expected_paid: Decimal, *, session: Any
) -> None:
    ledger_paid = await cash_paid_from_ledger(db, invoice_id, session=session)
    if ledger_paid != _money(expected_paid):
        raise ValueError("Invoice cash-paid amount does not reconcile to PAY and REV documents")



async def assert_invoice_receivable_fields_reconcile(
    db: Any, invoice: dict[str, Any], *, session: Any
) -> None:
    """Fail closed when invoice receivable snapshots drift from their source ledgers."""
    invoice_id = str(invoice.get("id") or "")
    if not invoice_id:
        raise ValueError("Invoice identifier is required for receivable reconciliation")

    gross = _decimal(invoice.get("total_amount_dt"))
    credited = _decimal(invoice.get("credited_amount_dt", Decimal128("0.000")))
    net = _decimal(invoice.get("net_amount_dt", gross - credited))
    paid = _decimal(invoice.get("paid_amount_dt", Decimal128("0.000")))
    applied_credit = _decimal(invoice.get("applied_credit_amount_dt", Decimal128("0.000")))
    outstanding = _decimal(invoice.get("outstanding_amount_dt"))
    expected_outstanding = max(Decimal("0.000"), net - paid - applied_credit)

    if (
        gross < 0
        or credited < 0
        or credited > gross
        or paid < 0
        or applied_credit < 0
        or net < 0
        or net != gross - credited
        or outstanding != expected_outstanding
    ):
        raise ValueError("Invoice receivable fields are inconsistent; reconcile before recording payment")

    await assert_invoice_cash_paid_reconciles(db, invoice_id, paid, session=session)

    applications = await db["commercial_buyer_credit_applications"].find(
        {"target_invoice_id": invoice_id, "status": "APPLIED"},
        {"_id": 0, "amount_dt": 1},
        session=session,
    ).to_list(None)
    ledger_applied = _money(sum(
        (_decimal(item["amount_dt"]) for item in applications),
        Decimal("0.000"),
    ))
    if ledger_applied != _money(applied_credit):
        raise ValueError("Invoice applied-credit amount does not reconcile to CAP documents")
