import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from bson.decimal128 import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient

from commercial.inventory_bootstrap import ensure_inventory_indexes
from commercial.schemas.credit_application import BuyerCreditApplicationDraft
from commercial.services.credit_application import apply_buyer_credit_to_invoice


@pytest.mark.asyncio
async def test_credit_application_allocates_oldest_credit_notes_and_updates_invoice_atomically():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "buyer_credit_application_" + uuid.uuid4().hex
    db = client[name]
    now = datetime(2026, 11, 2, tzinfo=timezone.utc)
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "CAP", "last_sequence": 0
        })
        await db.commercial_buyers.insert_one({
            "id": "buyer-a", "name": "Buyer A", "active": True,
            "credit_balance_dt": Decimal128("75.000"), "version": 1,
        })
        await db.commercial_sales_invoices.insert_one({
            "id": "invoice-target", "season_code": "2627",
            "document_number": "2627FAC0009", "buyer_id": "buyer-a",
            "sale_id": "sale-target", "total_amount_dt": Decimal128("100.000"),
            "credited_amount_dt": Decimal128("0.000"), "net_amount_dt": Decimal128("100.000"),
            "paid_amount_dt": Decimal128("0.000"), "applied_credit_amount_dt": Decimal128("0.000"),
            "outstanding_amount_dt": Decimal128("100.000"), "payment_status": "UNPAID", "version": 1,
        })
        for note_id, amount, sequence in [
            ("credit-note-oldest", "40.000", 1),
            ("credit-note-newest", "35.000", 2),
        ]:
            await db.commercial_credit_notes.insert_one({
                "id": note_id, "buyer_id": "buyer-a", "status": "ISSUED",
                "amount_dt": Decimal128(amount), "created_at": datetime(2026, 10, sequence, tzinfo=timezone.utc),
            })
            await db.commercial_buyer_credit_ledger.insert_one({
                "id": "credit-entry-" + note_id, "buyer_id": "buyer-a",
                "credit_note_id": note_id, "invoice_id": "invoice-source-" + str(sequence),
                "entry_kind": "CREDIT_NOTE_ADJUSTMENT", "amount_delta_dt": Decimal128(amount),
                "balance_before_dt": Decimal128("0.000"),
                "balance_after_dt": Decimal128(amount),
                "created_at": datetime(2026, 10, sequence, tzinfo=timezone.utc),
            })

        draft = BuyerCreditApplicationDraft(
            amount_dt=Decimal("60.000"),
            expected_invoice_version=1,
            reason="Apply available credit to invoice",
            idempotency_key="buyer-credit-application-0001",
        )

        async def post(application_id, audit_id):
            async with await client.start_session() as session:
                return await session.with_transaction(
                    lambda active: apply_buyer_credit_to_invoice(
                        db, "invoice-target", draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        application_id=application_id, audit_event_id=audit_id,
                        created_at=now, session=active,
                    )
                )

        application = await post("application-1", "application-audit-1")
        assert application["document_number"] == "2627CAP0001"
        assert application["amount_dt"].to_decimal() == Decimal("60.000")
        assert [item["credit_note_id"] for item in application["source_allocations"]] == [
            "credit-note-oldest", "credit-note-newest"
        ]
        assert [item["amount_dt"].to_decimal() for item in application["source_allocations"]] == [
            Decimal("40.000"), Decimal("20.000")
        ]

        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-target"}, {"_id": 0})
        assert invoice["applied_credit_amount_dt"].to_decimal() == Decimal("60.000")
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("40.000")
        assert invoice["payment_status"] == "PARTIALLY_PAID"
        assert invoice["paid_amount_dt"].to_decimal() == Decimal("0.000")

        buyer = await db.commercial_buyers.find_one({"id": "buyer-a"}, {"_id": 0})
        assert buyer["credit_balance_dt"].to_decimal() == Decimal("15.000")
        adjustments = await db.commercial_buyer_credit_ledger.find(
            {"source_document_type": "CAP"}, {"_id": 0}
        ).to_list(10)
        assert len(adjustments) == 2
        assert sum(item["amount_delta_dt"].to_decimal() for item in adjustments) == Decimal("-60.000")
        assert await db.commercial_buyer_credit_applications.count_documents({}) == 1
        assert await db.commercial_audit_events.count_documents({}) == 1

        repeated = await post("unused-application-id", "unused-audit-id")
        assert repeated["id"] == "application-1"
        assert await db.commercial_buyer_credit_applications.count_documents({}) == 1
        assert await db.commercial_buyer_credit_ledger.count_documents({"source_document_type": "CAP"}) == 2
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_credit_application_fails_closed_when_buyer_balance_does_not_match_credit_ledger():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "buyer_credit_ledger_mismatch_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "CAP", "last_sequence": 0
        })
        await db.commercial_buyers.insert_one({
            "id": "buyer-a", "name": "Buyer A", "credit_balance_dt": Decimal128("50.000"), "version": 1,
        })
        await db.commercial_sales_invoices.insert_one({
            "id": "invoice-target", "buyer_id": "buyer-a", "total_amount_dt": Decimal128("100.000"),
            "credited_amount_dt": Decimal128("0.000"), "net_amount_dt": Decimal128("100.000"),
            "paid_amount_dt": Decimal128("0.000"), "applied_credit_amount_dt": Decimal128("0.000"),
            "outstanding_amount_dt": Decimal128("100.000"), "payment_status": "UNPAID", "version": 1,
        })
        await db.commercial_credit_notes.insert_one({
            "id": "credit-note-a", "buyer_id": "buyer-a", "status": "ISSUED",
        })
        await db.commercial_buyer_credit_ledger.insert_one({
            "id": "credit-entry-a", "buyer_id": "buyer-a", "credit_note_id": "credit-note-a",
            "invoice_id": "invoice-source", "entry_kind": "CREDIT_NOTE_ADJUSTMENT",
            "amount_delta_dt": Decimal128("40.000"), "created_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
        })
        draft = BuyerCreditApplicationDraft(
            amount_dt=Decimal("10.000"), expected_invoice_version=1,
            reason="Apply credit after balance mismatch",
            idempotency_key="buyer-credit-application-mismatch-001",
        )
        with pytest.raises(ValueError, match="does not reconcile"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: apply_buyer_credit_to_invoice(
                        db, "invoice-target", draft, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        application_id="mismatch-application", audit_event_id="mismatch-audit",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=active,
                    )
                )
        assert await db.commercial_buyer_credit_applications.count_documents({}) == 0
        invoice = await db.commercial_sales_invoices.find_one({"id": "invoice-target"})
        assert invoice["outstanding_amount_dt"].to_decimal() == Decimal("100.000")
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.asyncio
async def test_credit_application_rejects_amount_above_outstanding_or_available_credit():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    name = "buyer_credit_limits_" + uuid.uuid4().hex
    db = client[name]
    try:
        await ensure_inventory_indexes(db)
        await db.commercial_counters.insert_one({
            "season_code": "2627", "document_type": "CAP", "last_sequence": 0
        })
        await db.commercial_buyers.insert_one({
            "id": "buyer-a", "name": "Buyer A", "credit_balance_dt": Decimal128("15.000"), "version": 1,
        })
        await db.commercial_sales_invoices.insert_one({
            "id": "invoice-target", "buyer_id": "buyer-a", "total_amount_dt": Decimal128("40.000"),
            "credited_amount_dt": Decimal128("0.000"), "net_amount_dt": Decimal128("40.000"),
            "paid_amount_dt": Decimal128("0.000"), "applied_credit_amount_dt": Decimal128("0.000"),
            "outstanding_amount_dt": Decimal128("40.000"), "payment_status": "UNPAID", "version": 1,
        })
        await db.commercial_credit_notes.insert_one({"id": "credit-note-a", "buyer_id": "buyer-a", "status": "ISSUED"})
        await db.commercial_buyer_credit_ledger.insert_one({
            "id": "credit-entry-a", "buyer_id": "buyer-a", "credit_note_id": "credit-note-a",
            "invoice_id": "invoice-source", "entry_kind": "CREDIT_NOTE_ADJUSTMENT",
            "amount_delta_dt": Decimal128("15.000"), "created_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
        })
        too_much = BuyerCreditApplicationDraft(
            amount_dt=Decimal("20.000"), expected_invoice_version=1,
            reason="Apply more credit than available",
            idempotency_key="buyer-credit-application-limit-001",
        )
        with pytest.raises(ValueError, match="insufficient available credit"):
            async with await client.start_session() as session:
                await session.with_transaction(
                    lambda active: apply_buyer_credit_to_invoice(
                        db, "invoice-target", too_much, season_code="2627",
                        actor_user={"active": True, "role": "admin"},
                        actor_user_id="integration-admin",
                        application_id="limit-application", audit_event_id="limit-audit",
                        created_at=datetime(2026, 11, 2, tzinfo=timezone.utc), session=active,
                    )
                )
        assert await db.commercial_buyer_credit_applications.count_documents({}) == 0
    finally:
        await client.drop_database(name)
        client.close()
