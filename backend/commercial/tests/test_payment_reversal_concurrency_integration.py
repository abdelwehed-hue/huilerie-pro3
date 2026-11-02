import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from bson.decimal128 import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient

from commercial.inventory_bootstrap import ensure_inventory_indexes
from commercial.schemas.payment_reversal import PaymentReversalDraft
from commercial.services.payment_reversal import reverse_sale_payment


def _invoice(invoice_id, *, gross, credited, paid, applied="0.000", version=1):
    net = Decimal(gross) - Decimal(credited)
    outstanding = max(Decimal("0.000"), net - Decimal(paid) - Decimal(applied))
    return {
        "id": invoice_id, "season_code": "2627", "document_number": "2627FAC0001",
        "sale_id": "sale-" + invoice_id, "buyer_id": "buyer-a",
        "total_amount_dt": Decimal128(gross), "credited_amount_dt": Decimal128(credited),
        "net_amount_dt": Decimal128(str(net)), "paid_amount_dt": Decimal128(paid),
        "applied_credit_amount_dt": Decimal128(applied),
        "outstanding_amount_dt": Decimal128(str(outstanding)),
        "payment_status": "PAID" if outstanding == 0 else "PARTIALLY_PAID",
        "version": version,
    }


def _payment(payment_id, invoice_id, amount):
    return {
        "id": payment_id, "season_code": "2627", "document_type": "PAY",
        "document_number": "2627PAY0001", "invoice_id": invoice_id,
        "sale_id": "sale-" + invoice_id, "amount_dt": Decimal128(amount),
        "payment_date": "2026-10-20", "method": "CASH",
        "created_at": datetime(2026, 10, 20, tzinfo=timezone.utc),
    }


@pytest.mark.asyncio
async def test_concurrent_payment_reversals_cannot_over_reverse_the_same_payment():
    import asyncio

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "payment_reversal_concurrency_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "REV", "last_sequence": 0
        })
        await db.commercial_sales_invoices.insert_one(
            _invoice("invoice-concurrent", gross="100.000", credited="0.000", paid="100.000")
        )
        await db.commercial_sale_payments.insert_one(
            _payment("payment-concurrent", "invoice-concurrent", "100.000")
        )

        async def post(index):
            draft = PaymentReversalDraft(
                reversal_date="2026-11-02",
                amount_dt=Decimal("60.000"),
                expected_invoice_version=1,
                reason="Concurrent payment reversal test",
                idempotency_key=f"payment-reversal-concurrency-{index:04d}",
            )
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: reverse_sale_payment(
                        db, "payment-concurrent", draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        reversal_id=f"concurrent-reversal-{index}",
                        audit_event_id=f"concurrent-audit-{index}",
                        created_at=now, session=active,
                    )
                )

        results = await asyncio.gather(post(1), post(2), return_exceptions=True)
        successes = [item for item in results if isinstance(item, dict)]
        failures = [item for item in results if isinstance(item, Exception)]
        assert len(successes) == 1
        assert len(failures) == 1
        assert await db.commercial_payment_reversals.count_documents({}) == 1
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-concurrent"}, {"_id": 0})
        assert invoice["paid_amount_dt"].to_decimal() == Decimal("40.000")
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("60.000")
        counter = await db.commercial_counters.find_one({"document_type": "REV"})
        assert counter["last_sequence"] == 1
    finally:
        await client.drop_database(name)
        client.close()
