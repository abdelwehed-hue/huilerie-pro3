"""Apply previously issued buyer credit to an outstanding commercial invoice."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.credit_application import BuyerCreditApplicationDraft
from commercial.services.numbering import reserve_document_number


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value or "0"))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _fingerprint(command: BuyerCreditApplicationDraft) -> str:
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


async def apply_buyer_credit_to_invoice(
    db: Any,
    invoice_id: str,
    draft: BuyerCreditApplicationDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    application_id: str,
    audit_event_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Apply available AVO buyer credit without fabricating a cash payment."""
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not all((invoice_id, application_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable application identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    invoices = db["commercial_sales_invoices"]
    invoice = await invoices.find_one({"id": invoice_id}, {"_id": 0}, session=session)
    if not invoice:
        raise ValueError("Commercial sales invoice does not exist")

    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    applications = db["commercial_buyer_credit_applications"]
    prior = await applications.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint or prior.get("target_invoice_id") != invoice_id:
            raise ValueError("Credit application idempotency key was used for a different request")
        return prior

    if invoice.get("version", 1) != draft.expected_invoice_version:
        raise ValueError("Invoice version conflict; refresh before applying buyer credit")
    buyer_id = invoice["buyer_id"]
    buyer = await db["commercial_buyers"].find_one(
        {"id": buyer_id}, {"_id": 0}, session=session
    )
    if not buyer:
        raise ValueError("Commercial buyer record is missing")

    gross = _decimal(invoice["total_amount_dt"])
    credited = _decimal(invoice.get("credited_amount_dt", Decimal128("0.000")))
    net = _decimal(invoice.get("net_amount_dt", Decimal128(gross - credited)))
    paid = _decimal(invoice.get("paid_amount_dt", Decimal128("0.000")))
    applied_before = _decimal(invoice.get("applied_credit_amount_dt", Decimal128("0.000")))
    outstanding_before = _decimal(invoice["outstanding_amount_dt"])
    expected_net = gross - credited
    expected_outstanding = max(Decimal("0.000"), expected_net - paid - applied_before)
    if (gross < 0 or credited < 0 or paid < 0 or applied_before < 0
            or net != expected_net or outstanding_before != expected_outstanding):
        raise ValueError("Invoice receivable fields are inconsistent; reconcile before applying credit")
    amount = _money(draft.amount_dt)
    if amount <= 0 or amount > outstanding_before:
        raise ValueError("Credit application must not exceed the invoice outstanding balance")

    buyer_credit_before = _decimal(buyer.get("credit_balance_dt", Decimal128("0.000")))
    if buyer_credit_before <= 0 or amount > buyer_credit_before:
        raise ValueError("Buyer has insufficient available credit")

    ledger = db["commercial_buyer_credit_ledger"]
    source_entries = await ledger.find(
        {"buyer_id": buyer_id, "entry_kind": "CREDIT_NOTE_ADJUSTMENT"},
        {"_id": 0, "credit_note_id": 1, "invoice_id": 1, "amount_delta_dt": 1, "created_at": 1},
        session=session,
    ).sort([("created_at", 1), ("credit_note_id", 1)]).to_list(5000)
    source_ids = [entry["credit_note_id"] for entry in source_entries if entry.get("credit_note_id")]
    adjustment_totals: dict[str, Decimal] = {}
    if source_ids:
        adjustments = await ledger.find(
            {"buyer_id": buyer_id, "source_credit_note_id": {"$in": source_ids}},
            {"_id": 0, "source_credit_note_id": 1, "amount_delta_dt": 1},
            session=session,
        ).to_list(10000)
        for adjustment in adjustments:
            key = adjustment["source_credit_note_id"]
            adjustment_totals[key] = adjustment_totals.get(key, Decimal("0.000")) + _decimal(adjustment["amount_delta_dt"])

    available_sources = []
    total_available = Decimal("0.000")
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
        available_sources.append({
            "credit_note_id": credit_note_id,
            "source_invoice_id": entry.get("invoice_id"),
            "available_dt": available,
        })
        total_available += available

    total_available = _money(total_available)
    if total_available != _money(buyer_credit_before):
        raise ValueError("Buyer credit ledger does not reconcile to the buyer account balance")
    if amount > total_available:
        raise ValueError("Requested credit exceeds source credit notes still available")

    remaining = amount
    allocations = []
    for source in available_sources:
        if remaining <= 0:
            break
        applied = min(source["available_dt"], remaining)
        if applied > 0:
            allocations.append({
                "credit_note_id": source["credit_note_id"],
                "source_invoice_id": source["source_invoice_id"],
                "amount_dt": applied,
            })
            remaining = _money(remaining - applied)
    if remaining != Decimal("0.000"):
        raise ValueError("Buyer credit could not be fully allocated to issued credit notes")

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "CAP", session=session
    )
    now = created_at.astimezone(timezone.utc)
    buyer_credit_after = _money(buyer_credit_before - amount)
    applied_after = _money(applied_before + amount)
    outstanding_after = _money(outstanding_before - amount)
    payment_status = _settlement_status(net, paid, applied_after, outstanding_after)
    application = {
        "id": application_id,
        "season_code": season_code,
        "document_type": "CAP",
        "document_number": number,
        "buyer_id": buyer_id,
        "target_invoice_id": invoice_id,
        "amount_dt": Decimal128(amount),
        "source_allocations": [
            {**allocation, "amount_dt": Decimal128(allocation["amount_dt"])}
            for allocation in allocations
        ],
        "reason": draft.reason,
        "status": "APPLIED",
        "version": 1,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }

    invoice_update = await invoices.update_one(
        {"id": invoice_id, "version": draft.expected_invoice_version,
         "outstanding_amount_dt": invoice["outstanding_amount_dt"]},
        {"$set": {
            "applied_credit_amount_dt": Decimal128(applied_after),
            "outstanding_amount_dt": Decimal128(outstanding_after),
            "payment_status": payment_status,
            "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if invoice_update.matched_count != 1:
        raise ValueError("Invoice changed concurrently; credit application was rolled back")

    buyer_version = int(buyer.get("version", 1))
    buyer_version_filter = {"version": buyer_version} if "version" in buyer else {"version": {"$exists": False}}
    buyer_update = await db["commercial_buyers"].update_one(
        {"id": buyer_id, **buyer_version_filter},
        {"$set": {
            "credit_balance_dt": Decimal128(buyer_credit_after),
            "credit_balance_updated_at": now,
            "credit_balance_updated_by": actor_user_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if buyer_update.matched_count != 1:
        raise ValueError("Buyer account changed concurrently; credit application was rolled back")

    await applications.insert_one(application, session=session)
    running_balance = buyer_credit_before
    for allocation in allocations:
        allocation_amount = allocation["amount_dt"]
        balance_after = _money(running_balance - allocation_amount)
        adjustment_id = str(uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"CAP:{application_id}:{allocation['credit_note_id']}",
        ))
        await ledger.insert_one({
            "id": adjustment_id,
            "buyer_id": buyer_id,
            "source_document_type": "CAP",
            "source_document_id": application_id,
            "source_credit_note_id": allocation["credit_note_id"],
            "source_invoice_id": allocation["source_invoice_id"],
            "target_invoice_id": invoice_id,
            "entry_kind": "CREDIT_APPLICATION",
            "amount_delta_dt": Decimal128(-allocation_amount),
            "balance_before_dt": Decimal128(running_balance),
            "balance_after_dt": Decimal128(balance_after),
            "created_by": actor_user_id,
            "created_at": now,
        }, session=session)
        running_balance = balance_after

    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id,
        "entity_type": "commercial_buyer_credit_application",
        "entity_id": application_id,
        "action": "BUYER_CREDIT_APPLIED_TO_INVOICE",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "application_number": number,
            "buyer_id": buyer_id,
            "target_invoice_id": invoice_id,
            "amount_dt": Decimal128(amount),
            "buyer_credit_balance_before_dt": Decimal128(buyer_credit_before),
            "buyer_credit_balance_after_dt": Decimal128(buyer_credit_after),
            "outstanding_before_dt": Decimal128(outstanding_before),
            "outstanding_after_dt": Decimal128(outstanding_after),
            "source_allocations": application["source_allocations"],
        },
    }, session=session)
    return application
