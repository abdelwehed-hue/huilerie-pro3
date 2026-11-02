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
    ).to_list(10000)
    reversals = await db["commercial_payment_reversals"].find(
        {"invoice_id": invoice_id}, {"_id": 0, "amount_dt": 1}, session=session
    ).to_list(10000)
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
