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
    status = "PAID" if outstanding == 0 and net > 0 else (
        "CREDITED" if net == 0 else (
            "PARTIALLY_PAID" if Decimal(paid) + Decimal(applied) > 0 else "UNPAID"
        )
    )
    return {
        "id": invoice_id, "season_code": "2627", "document_number": "2627FAC0001",
        "sale_id": "sale-" + invoice_id, "buyer_id": "buyer-a",
        "total_amount_dt": Decimal128(gross), "credited_amount_dt": Decimal128(credited),
        "net_amount_dt": Decimal128(str(net)), "paid_amount_dt": Decimal128(paid),
        "applied_credit_amount_dt": Decimal128(applied),
        "outstanding_amount_dt": Decimal128(str(outstanding)),
        "payment_status": status, "version": version,
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
async def test_payment_reversal_is_append_only_and_updates_invoice_balance():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "payment_reversal_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "REV", "last_sequence": 0
        })
        await db.commercial_sales_invoices.insert_one(
            _invoice("invoice-a", gross="100.000", credited="0.000", paid="60.000")
        )
        await db.commercial_sale_payments.insert_one(_payment("payment-a", "invoice-a", "60.000"))

        draft = PaymentReversalDraft(
            reversal_date="2026-11-02",
            amount_dt=Decimal("20.000"), expected_invoice_version=1,
            reason="Correct duplicate cash entry",
            idempotency_key="payment-reversal-append-only-001",
        )

        async def post(reversal_id, audit_id, command=draft):
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: reverse_sale_payment(
                        db, "payment-a", command, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        reversal_id=reversal_id, audit_event_id=audit_id,
                        created_at=now, session=active,
                    )
                )

        reversal = await post("reversal-1", "reversal-audit-1")
        assert reversal["document_number"] == "2627REV0001"
        assert reversal["status"] == "PARTIALLY_REVERSED"
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-a"}, {"_id": 0})
        assert invoice["paid_amount_dt"].to_decimal() == Decimal("40.000")
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("60.000")
        assert invoice["payment_status"] == "PARTIALLY_PAID"

        original_payment = await db.commercial_sale_payments.find_one({"id": "payment-a"}, {"_id": 0})
        assert original_payment["amount_dt"].to_decimal() == Decimal("60.000")
        repeated = await post("unused-reversal-id", "unused-audit-id")
        assert repeated["id"] == "reversal-1"
        assert await db.commercial_payment_reversals.count_documents({}) == 1

        second = PaymentReversalDraft(
            amount_dt=Decimal("40.000"), expected_invoice_version=2,
            reason="Reverse remaining amount",
            idempotency_key="payment-reversal-append-only-002",
        )
        full = await post("reversal-2", "reversal-audit-2", second)
        assert full["document_number"] == "2627REV0002"
        assert full["status"] == "REVERSED"
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-a"}, {"_id": 0})
        assert invoice["paid_amount_dt"].to_decimal() == Decimal("0.000")
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("100.000")
        assert invoice["payment_status"] == "UNPAID"
        assert await db.commercial_sale_payments.count_documents({}) == 1
        assert await db.commercial_payment_reversals.count_documents({}) == 2
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_payment_reversal_reduces_only_unapplied_credit_from_same_invoice():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "payment_reversal_credit_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "REV", "last_sequence": 0
        })
        await db.commercial_buyers.insert_one({
            "id": "buyer-a", "name": "Buyer A", "credit_balance_dt": Decimal128("100.000"), "version": 1,
        })
        await db.commercial_sales_invoices.insert_one(
            _invoice("invoice-credit", gross="500.000", credited="100.000", paid="500.000")
        )
        await db.commercial_sale_payments.insert_one(_payment("payment-credit", "invoice-credit", "500.000"))
        await db.commercial_credit_notes.insert_one({
            "id": "credit-note-a", "buyer_id": "buyer-a", "status": "ISSUED",
        })
        await db.commercial_buyer_credit_ledger.insert_one({
            "id": "credit-entry-a", "buyer_id": "buyer-a",
            "credit_note_id": "credit-note-a", "invoice_id": "invoice-credit",
            "entry_kind": "CREDIT_NOTE_ADJUSTMENT", "amount_delta_dt": Decimal128("100.000"),
            "created_at": datetime(2026, 10, 21, tzinfo=timezone.utc),
        })
        draft = PaymentReversalDraft(
            amount_dt=Decimal("100.000"), expected_invoice_version=1,
            reason="Reverse payment against credited invoice",
            idempotency_key="payment-reversal-credit-001",
        )
        async with await client.start_session() as session:
            reversal = await session.with_transaction(
                lambda active: reverse_sale_payment(
                    db, "payment-credit", draft, season_code="2627",
                    actor_user={"active": True, "role": "admin"},
                    actor_user_id="integration-admin",
                    reversal_id="reversal-credit-1", audit_event_id="reversal-credit-audit-1",
                    created_at=now, session=active,
                )
            )
        assert reversal["buyer_credit_reduction_dt"].to_decimal() == Decimal("100.000")
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-credit"}, {"_id": 0})
        assert invoice["paid_amount_dt"].to_decimal() == Decimal("400.000")
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("0.000")
        buyer = await db.commercial_buyers.find_one({"id": "buyer-a"}, {"_id": 0})
        assert buyer["credit_balance_dt"].to_decimal() == Decimal("0.000")
        adjustment = await db.commercial_buyer_credit_ledger.find_one(
            {"source_document_type": "REV"}, {"_id": 0}
        )
        assert adjustment["amount_delta_dt"].to_decimal() == Decimal("-100.000")
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_payment_reversal_is_blocked_when_source_credit_was_already_applied():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "payment_reversal_consumed_credit_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "REV", "last_sequence": 0
        })
        await db.commercial_buyers.insert_one({
            "id": "buyer-a", "name": "Buyer A", "credit_balance_dt": Decimal128("0.000"), "version": 2,
        })
        await db.commercial_sales_invoices.insert_one(
            _invoice("invoice-credit", gross="500.000", credited="100.000", paid="500.000")
        )
        await db.commercial_sale_payments.insert_one(_payment("payment-credit", "invoice-credit", "500.000"))
        await db.commercial_credit_notes.insert_one({
            "id": "credit-note-a", "buyer_id": "buyer-a", "status": "ISSUED",
        })
        await db.commercial_buyer_credit_ledger.insert_many([
            {
                "id": "credit-entry-a", "buyer_id": "buyer-a",
                "credit_note_id": "credit-note-a", "invoice_id": "invoice-credit",
                "entry_kind": "CREDIT_NOTE_ADJUSTMENT", "amount_delta_dt": Decimal128("100.000"),
                "created_at": datetime(2026, 10, 21, tzinfo=timezone.utc),
            },
            {
                "id": "credit-used-a", "buyer_id": "buyer-a",
                "source_document_type": "CAP", "source_document_id": "cap-1",
                "source_credit_note_id": "credit-note-a", "source_invoice_id": "invoice-credit",
                "target_invoice_id": "another-invoice", "entry_kind": "CREDIT_APPLICATION",
                "amount_delta_dt": Decimal128("-100.000"),
                "created_at": datetime(2026, 10, 22, tzinfo=timezone.utc),
            },
        ])
        draft = PaymentReversalDraft(
            amount_dt=Decimal("100.000"), expected_invoice_version=1,
            reason="Attempt reversal after credit was used",
            idempotency_key="payment-reversal-consumed-credit-001",
        )
        with pytest.raises(ValueError, match="already been applied"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: reverse_sale_payment(
                        db, "payment-credit", draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        reversal_id="reversal-consumed-1", audit_event_id="reversal-consumed-audit-1",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=active,
                    )
                )
        assert await db.commercial_payment_reversals.count_documents({}) == 0
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-credit"}, {"_id": 0})
        assert invoice["paid_amount_dt"].to_decimal() == Decimal("500.000")
    finally:
        await client.drop_database(name)
        client.close()
