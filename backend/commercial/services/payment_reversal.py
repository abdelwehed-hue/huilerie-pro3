"""Immutable reversal of an already-recorded wholesale sale payment."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.payment_reversal import PaymentReversalDraft
from commercial.services.numbering import reserve_document_number
from commercial.services.payment_ledger import assert_invoice_receivable_fields_reconcile


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value or "0"))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _fingerprint(command: PaymentReversalDraft) -> str:
    raw = json.dumps(command.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _settlement_status(net: Decimal, paid: Decimal, applied_credit: Decimal, outstanding: Decimal) -> str:
    settled = paid + applied_credit
    if outstanding == Decimal("0.000"):
        if net == Decimal("0.000") and settled == Decimal("0.000"):
            return "CREDITED"
        return "PAID"
    if settled > Decimal("0.000"):
        return "PARTIALLY_PAID"
    return "UNPAID"


async def reverse_sale_payment(
    db: Any,
    payment_id: str,
    draft: PaymentReversalDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    reversal_id: str,
    audit_event_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Post a partial/full REV document; never edit or delete the original PAY."""
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not all((payment_id, reversal_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable reversal identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    payments = db["commercial_sale_payments"]
    payment = await payments.find_one({"id": payment_id}, {"_id": 0}, session=session)
    if not payment:
        raise ValueError("Original payment does not exist")
    invoice_id = payment["invoice_id"]
    invoices = db["commercial_sales_invoices"]
    invoice = await invoices.find_one({"id": invoice_id}, {"_id": 0}, session=session)
    if not invoice:
        raise ValueError("Original payment invoice does not exist")

    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    reversals = db["commercial_payment_reversals"]
    prior = await reversals.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if (prior.get("request_fingerprint") != fingerprint
                or prior.get("payment_id") != payment_id):
            raise ValueError("Payment reversal idempotency key was used for a different request")
        return prior

    if invoice.get("version", 1) != draft.expected_invoice_version:
        raise ValueError("Invoice version conflict; refresh before reversing payment")

    evidence_reference = (draft.evidence_reference or payment.get("reference") or "").strip() or None
    if payment.get("method") in {"BANK_TRANSFER", "CHEQUE"} and not evidence_reference:
        raise ValueError("A bank or cheque reversal requires a traceable evidence reference")

    original_amount = _decimal(payment["amount_dt"])
    previous_reversals = await reversals.find(
        {"payment_id": payment_id}, {"_id": 0, "amount_dt": 1}, session=session
    ).to_list(None)
    already_reversed = _money(sum((_decimal(item["amount_dt"]) for item in previous_reversals), Decimal("0.000")))
    remaining_payment = _money(original_amount - already_reversed)
    amount = _money(draft.amount_dt)
    if amount <= 0 or amount > remaining_payment:
        raise ValueError("Reversal exceeds the remaining amount of the original payment")

    gross = _decimal(invoice["total_amount_dt"])
    credited = _decimal(invoice.get("credited_amount_dt", Decimal128("0.000")))
    net = _decimal(invoice.get("net_amount_dt", Decimal128(gross - credited)))
    paid = _decimal(invoice.get("paid_amount_dt", Decimal128("0.000")))
    applied_credit = _decimal(invoice.get("applied_credit_amount_dt", Decimal128("0.000")))
    outstanding_before = _decimal(invoice["outstanding_amount_dt"])
    await assert_invoice_receivable_fields_reconcile(db, invoice, session=session)
    if amount > paid:
        raise ValueError("Reversal exceeds the cash paid amount remaining on the invoice")

    new_paid = _money(paid - amount)
    previous_excess = max(Decimal("0.000"), paid + applied_credit - net)
    new_excess = max(Decimal("0.000"), new_paid + applied_credit - net)
    credit_to_reduce = _money(previous_excess - new_excess)
    if credit_to_reduce < 0:
        raise ValueError("Buyer credit reduction calculation is inconsistent")

    buyer = None
    buyer_credit_before = Decimal("0.000")
    buyer_credit_after = Decimal("0.000")
    credit_allocations: list[dict[str, Any]] = []
    if credit_to_reduce > 0:
        buyer_id = invoice["buyer_id"]
        buyer = await db["commercial_buyers"].find_one(
            {"id": buyer_id}, {"_id": 0}, session=session
        )
        if not buyer:
            raise ValueError("Commercial buyer record is missing")
        buyer_credit_before = _decimal(buyer.get("credit_balance_dt", Decimal128("0.000")))
        ledger = db["commercial_buyer_credit_ledger"]
        source_entries = await ledger.find(
            {"buyer_id": buyer_id, "entry_kind": "CREDIT_NOTE_ADJUSTMENT"},
            {"_id": 0, "credit_note_id": 1, "invoice_id": 1, "amount_delta_dt": 1, "created_at": 1},
            session=session,
        ).sort([("created_at", 1), ("credit_note_id", 1)]).to_list(None)
        source_ids = [entry["credit_note_id"] for entry in source_entries if entry.get("credit_note_id")]
        adjustment_totals: dict[str, Decimal] = {}
        if source_ids:
            adjustments = await ledger.find(
                {"buyer_id": buyer_id, "source_credit_note_id": {"$in": source_ids}},
                {"_id": 0, "source_credit_note_id": 1, "amount_delta_dt": 1},
                session=session,
            ).to_list(None)
            for adjustment in adjustments:
                key = adjustment["source_credit_note_id"]
                adjustment_totals[key] = adjustment_totals.get(key, Decimal("0.000")) + _decimal(adjustment["amount_delta_dt"])

        total_available = Decimal("0.000")
        invoice_sources = []
        for entry in source_entries:
            credit_note_id = entry.get("credit_note_id")
            if not credit_note_id:
                continue
            original = _decimal(entry.get("amount_delta_dt", Decimal128("0.000")))
            available = _money(original + adjustment_totals.get(credit_note_id, Decimal("0.000")))
            if available < 0:
                raise ValueError("A buyer credit source has a negative available balance; reconcile first")
            if available == 0:
                continue
            note = await db["commercial_credit_notes"].find_one(
                {"id": credit_note_id, "buyer_id": buyer_id, "status": "ISSUED"},
                {"_id": 0, "id": 1}, session=session,
            )
            if not note:
                raise ValueError("Buyer credit ledger references a missing or invalid credit note")
            total_available += available
            if entry.get("invoice_id") == invoice_id:
                invoice_sources.append({
                    "credit_note_id": credit_note_id,
                    "available_dt": available,
                })

        total_available = _money(total_available)
        if total_available != _money(buyer_credit_before):
            raise ValueError("Buyer credit ledger does not reconcile to the buyer account balance")
        invoice_credit_available = _money(sum(
            (item["available_dt"] for item in invoice_sources), Decimal("0.000")
        ))
        if credit_to_reduce > invoice_credit_available:
            raise ValueError("Buyer credit from this invoice has already been applied; payment reversal is blocked")
        if credit_to_reduce > buyer_credit_before:
            raise ValueError("Buyer credit balance is insufficient to reverse this payment")

        remaining_credit = credit_to_reduce
        for source in invoice_sources:
            if remaining_credit <= 0:
                break
            allocated = min(source["available_dt"], remaining_credit)
            if allocated > 0:
                credit_allocations.append({
                    "credit_note_id": source["credit_note_id"],
                    "amount_dt": allocated,
                })
                remaining_credit = _money(remaining_credit - allocated)
        if remaining_credit != Decimal("0.000"):
            raise ValueError("Payment reversal could not be allocated to available source credit notes")
        buyer_credit_after = _money(buyer_credit_before - credit_to_reduce)

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "REV", session=session
    )
    now = created_at.astimezone(timezone.utc)
    new_outstanding = _money(max(Decimal("0.000"), net - new_paid - applied_credit))
    payment_status = _settlement_status(net, new_paid, applied_credit, new_outstanding)
    reversal_remaining = _money(remaining_payment - amount)
    reversal = {
        "id": reversal_id,
        "season_code": season_code,
        "document_type": "REV",
        "document_number": number,
        "payment_id": payment_id,
        "original_payment_number": payment["document_number"],
        "invoice_id": invoice_id,
        "buyer_id": invoice["buyer_id"],
        "amount_dt": Decimal128(amount),
        "reversal_date": draft.reversal_date.isoformat(),
        "evidence_reference": evidence_reference,
        "payment_method": payment["method"],
        "payment_reference": payment.get("reference"),
        "reason": draft.reason,
        "status": "REVERSED" if reversal_remaining == Decimal("0.000") else "PARTIALLY_REVERSED",
        "remaining_reversible_dt": Decimal128(reversal_remaining),
        "credit_adjustments": [
            {**item, "amount_dt": Decimal128(item["amount_dt"])}
            for item in credit_allocations
        ],
        "invoice_outstanding_before_dt": Decimal128(outstanding_before),
        "invoice_outstanding_after_dt": Decimal128(new_outstanding),
        "buyer_credit_reduction_dt": Decimal128(credit_to_reduce),
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }

    invoice_update = await invoices.update_one(
        {"id": invoice_id, "version": draft.expected_invoice_version,
         "outstanding_amount_dt": invoice["outstanding_amount_dt"],
         "paid_amount_dt": invoice["paid_amount_dt"]},
        {"$set": {
            "paid_amount_dt": Decimal128(new_paid),
            "outstanding_amount_dt": Decimal128(new_outstanding),
            "payment_status": payment_status,
            "updated_at": now,
            "updated_by": actor_user_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if invoice_update.matched_count != 1:
        raise ValueError("Invoice changed concurrently; payment reversal was rolled back")

    if buyer is not None:
        buyer_version = int(buyer.get("version", 1))
        buyer_version_filter = {"version": buyer_version} if "version" in buyer else {"version": {"$exists": False}}
        buyer_update = await db["commercial_buyers"].update_one(
            {"id": invoice["buyer_id"], **buyer_version_filter},
            {"$set": {
                "credit_balance_dt": Decimal128(buyer_credit_after),
                "credit_balance_updated_at": now,
                "credit_balance_updated_by": actor_user_id,
            }, "$inc": {"version": 1}},
            session=session,
        )
        if buyer_update.matched_count != 1:
            raise ValueError("Buyer account changed concurrently; payment reversal was rolled back")

    await reversals.insert_one(reversal, session=session)
    running_balance = buyer_credit_before
    for allocation in credit_allocations:
        allocated = allocation["amount_dt"]
        balance_after = _money(running_balance - allocated)
        adjustment_id = str(uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"REV:{reversal_id}:{allocation['credit_note_id']}",
        ))
        await db["commercial_buyer_credit_ledger"].insert_one({
            "id": adjustment_id,
            "buyer_id": invoice["buyer_id"],
            "source_document_type": "REV",
            "source_document_id": reversal_id,
            "source_credit_note_id": allocation["credit_note_id"],
            "source_invoice_id": invoice_id,
            "entry_kind": "PAYMENT_REVERSAL",
            "amount_delta_dt": Decimal128(-allocated),
            "balance_before_dt": Decimal128(running_balance),
            "balance_after_dt": Decimal128(balance_after),
            "created_by": actor_user_id,
            "created_at": now,
        }, session=session)
        running_balance = balance_after

    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id,
        "entity_type": "commercial_payment_reversal",
        "entity_id": reversal_id,
        "action": "PAYMENT_REVERSED",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "reversal_number": number,
            "payment_id": payment_id,
            "original_payment_number": payment.get("document_number"),
            "payment_method": payment.get("method"),
            "payment_reference": payment.get("reference"),
            "invoice_id": invoice_id,
            "buyer_id": invoice.get("buyer_id"),
            "amount_dt": Decimal128(amount),
            "reason": draft.reason,
            "evidence_reference": evidence_reference,
            "previous_reversal_status": None,
            "new_reversal_status": reversal["status"],
            "payment_remaining_before_dt": Decimal128(remaining_payment),
            "payment_remaining_after_dt": Decimal128(reversal_remaining),
            "invoice_paid_before_dt": invoice.get("paid_amount_dt"),
            "invoice_paid_after_dt": Decimal128(new_paid),
            "invoice_outstanding_before_dt": Decimal128(outstanding_before),
            "invoice_outstanding_after_dt": Decimal128(new_outstanding),
            "previous_payment_status": invoice.get("payment_status"),
            "new_payment_status": payment_status,
            "buyer_credit_before_dt": Decimal128(buyer_credit_before),
            "buyer_credit_after_dt": Decimal128(buyer_credit_after),
            "buyer_credit_reduction_dt": Decimal128(credit_to_reduce),
            "credit_adjustments": reversal["credit_adjustments"],
        },
    }, session=session)
    return reversal
