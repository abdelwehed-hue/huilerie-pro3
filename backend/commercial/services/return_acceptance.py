"""Issue an audited credit note for an accepted physical sale return."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.return_acceptance import AcceptSaleReturnCommand
from commercial.services.numbering import reserve_document_number
from commercial.services.payment_ledger import assert_invoice_cash_paid_reconciles
from commercial.services.payment_ledger import assert_invoice_cash_paid_reconciles


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(value)


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _fingerprint(command: AcceptSaleReturnCommand) -> str:
    raw = json.dumps(command.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def accept_sale_return_and_issue_credit_note(
    db: Any, return_id: str, command: AcceptSaleReturnCommand, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    credit_note_id: str, buyer_credit_entry_id: str, audit_event_id: str,
    decided_at: datetime, session: Any,
) -> dict[str, Any]:
    """Accept the commercial return and adjust receivables without editing payments.

    This is a financial compensating document. It does not release returned oil,
    move quarantined stock, or issue a cash refund.
    """
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not all((return_id, credit_note_id, buyer_credit_entry_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable credit-note identifiers are required")
    if decided_at.tzinfo is None:
        raise ValueError("decided_at must be timezone-aware")

    returns = db["commercial_sale_returns"]
    returned = await returns.find_one({"id": return_id}, {"_id": 0}, session=session)
    if not returned:
        raise ValueError("Sale return does not exist")

    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(command)
    if returned.get("commercial_acceptance_status") == "ACCEPTED":
        if (returned.get("acceptance_idempotency_scope") == scope
                and returned.get("acceptance_idempotency_key") == command.idempotency_key
                and returned.get("acceptance_fingerprint") == fingerprint):
            existing = await db["commercial_credit_notes"].find_one(
                {"id": returned.get("credit_note_id")}, {"_id": 0}, session=session
            )
            if existing:
                return existing
        raise ValueError("Sale return has already been commercially accepted or decided")

    if returned.get("status") != "RECEIVED" or returned.get("commercial_acceptance_status") != "PENDING":
        raise ValueError("Only a received, undecided sale return can be accepted")
    if int(returned.get("version", 1)) != command.expected_return_version:
        raise ValueError("Sale return version conflict")

    sale = await db["commercial_sales"].find_one(
        {"id": returned["sale_id"], "status": "APPROVED"},
        {"_id": 0, "id": 1, "buyer_id": 1, "unit_price_dt": 1},
        session=session,
    )
    if not sale or sale.get("buyer_id") != returned.get("buyer_id"):
        raise ValueError("Return does not match an approved sale and its buyer")

    invoice = await db["commercial_sales_invoices"].find_one(
        {"id": returned["invoice_id"], "sale_id": sale["id"], "buyer_id": sale["buyer_id"]},
        {"_id": 0}, session=session,
    )
    if not invoice:
        raise ValueError("Return has no matching commercial invoice")

    buyer = await db["commercial_buyers"].find_one(
        {"id": sale["buyer_id"]}, {"_id": 0}, session=session
    )
    if not buyer:
        raise ValueError("Commercial buyer record is missing")

    gross = _decimal(invoice["total_amount_dt"])
    paid = _decimal(invoice.get("paid_amount_dt", Decimal128("0.000")))
    await assert_invoice_cash_paid_reconciles(db, invoice_id, paid, session=session)
    applied_credit = _decimal(invoice.get("applied_credit_amount_dt", Decimal128("0.000")))
    previous_credited = _decimal(invoice.get("credited_amount_dt", Decimal128("0.000")))
    previous_net = _decimal(invoice.get("net_amount_dt", gross - previous_credited))
    expected_previous_net = gross - previous_credited
    expected_previous_outstanding = max(Decimal("0.000"), expected_previous_net - paid - applied_credit)
    stored_previous_outstanding = _decimal(
        invoice.get("outstanding_amount_dt", Decimal128(expected_previous_outstanding))
    )
    if (gross < 0 or paid < 0 or applied_credit < 0 or previous_credited < 0
            or paid + applied_credit > gross
            or previous_net != expected_previous_net
            or stored_previous_outstanding != expected_previous_outstanding):
        raise ValueError("Invoice receivable fields are inconsistent; reconcile before issuing a credit note")
    await assert_invoice_cash_paid_reconciles(db, invoice["id"], paid, session=session)
    prior_applications = await db["commercial_buyer_credit_applications"].find(
        {"target_invoice_id": invoice["id"], "status": "APPLIED"},
        {"_id": 0, "amount_dt": 1}, session=session,
    ).to_list(10000)
    ledger_applied_credit = _money(sum(
        (_decimal(item["amount_dt"]) for item in prior_applications), Decimal("0.000")
    ))
    if ledger_applied_credit != applied_credit:
        raise ValueError("Invoice applied-credit amount does not reconcile to CAP documents")

    buyer_credit_before = _decimal(buyer.get("credit_balance_dt", Decimal128("0.000")))
    if buyer_credit_before < 0:
        raise ValueError("Buyer credit balance is negative; reconcile before issuing a credit note")
    source_entries = await db["commercial_buyer_credit_ledger"].find(
        {"buyer_id": buyer["id"], "entry_kind": "CREDIT_NOTE_ADJUSTMENT"},
        {"_id": 0, "credit_note_id": 1, "amount_delta_dt": 1},
        session=session,
    ).to_list(5000)
    source_ids = [entry["credit_note_id"] for entry in source_entries if entry.get("credit_note_id")]
    source_adjustments = []
    if source_ids:
        source_adjustments = await db["commercial_buyer_credit_ledger"].find(
            {"buyer_id": buyer["id"], "source_credit_note_id": {"$in": source_ids}},
            {"_id": 0, "source_credit_note_id": 1, "amount_delta_dt": 1},
            session=session,
        ).to_list(10000)
    adjustment_totals: dict[str, Decimal] = {}
    for adjustment in source_adjustments:
        key = adjustment["source_credit_note_id"]
        adjustment_totals[key] = adjustment_totals.get(key, Decimal("0.000")) + _decimal(adjustment["amount_delta_dt"])
    ledger_credit_balance = Decimal("0.000")
    for entry in source_entries:
        source_id = entry.get("credit_note_id")
        if not source_id:
            continue
        source_available = _money(
            _decimal(entry["amount_delta_dt"]) + adjustment_totals.get(source_id, Decimal("0.000"))
        )
        if source_available < 0:
            raise ValueError("Buyer credit source has a negative balance; reconcile before issuing a credit note")
        if source_available > 0:
            note = await db["commercial_credit_notes"].find_one(
                {"id": source_id, "buyer_id": buyer["id"], "status": "ISSUED"},
                {"_id": 0, "id": 1}, session=session,
            )
            if not note:
                raise ValueError("Buyer credit ledger references a missing or invalid credit note")
        ledger_credit_balance += source_available
    if _money(ledger_credit_balance) != _money(buyer_credit_before):
        raise ValueError("Buyer credit balance does not reconcile to the source credit-note ledger")

    credit_amount = _money(_decimal(returned["quantity_kg"]) * _decimal(sale["unit_price_dt"]))
    new_credited = previous_credited + credit_amount
    if credit_amount <= 0 or new_credited > gross:
        raise ValueError("Credit note would exceed the original invoice amount")
    new_net = gross - new_credited
    previous_excess = max(Decimal("0.000"), paid + applied_credit - previous_net)
    new_excess = max(Decimal("0.000"), paid + applied_credit - new_net)
    credit_balance_delta = new_excess - previous_excess
    if credit_balance_delta < 0:
        raise ValueError("Buyer credit balance calculation is inconsistent")
    buyer_credit_after = buyer_credit_before + credit_balance_delta
    outstanding = max(Decimal("0.000"), new_net - paid - applied_credit)

    total_settled = paid + applied_credit
    if new_net == Decimal("0.000") and total_settled == Decimal("0.000"):
        payment_status = "CREDITED"
    elif outstanding == Decimal("0.000"):
        payment_status = "PAID"
    elif total_settled == Decimal("0.000"):
        payment_status = "UNPAID"
    else:
        payment_status = "PARTIALLY_PAID"

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "AVO", session=session
    )
    now = decided_at.astimezone(timezone.utc)
    credit_note = {
        "id": credit_note_id, "season_code": season_code,
        "document_type": "AVO", "document_number": number,
        "return_id": return_id, "sale_id": sale["id"],
        "invoice_id": invoice["id"], "buyer_id": sale["buyer_id"],
        "returned_oil_lot_id": returned["returned_oil_lot_id"],
        "quantity_kg": returned["quantity_kg"],
        "unit_price_dt": Decimal128(_decimal(sale["unit_price_dt"])),
        "amount_dt": Decimal128(credit_amount),
        "gross_invoice_amount_dt": Decimal128(gross),
        "credited_invoice_amount_dt": Decimal128(new_credited),
        "net_invoice_amount_dt": Decimal128(new_net),
        "tax_treatment_status": "NOT_CONFIGURED",
        "reason": command.reason,
        "status": "ISSUED", "created_by": actor_user_id, "created_at": now,
        "idempotency_scope": scope, "idempotency_key": command.idempotency_key,
        "request_fingerprint": fingerprint,
    }

    invoice_update = await db["commercial_sales_invoices"].update_one(
        {"id": invoice["id"], "version": invoice.get("version", 1)},
        {"$set": {
            "credited_amount_dt": Decimal128(new_credited),
            "net_amount_dt": Decimal128(new_net),
            "outstanding_amount_dt": Decimal128(outstanding),
            "payment_status": payment_status,
            "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if invoice_update.matched_count != 1:
        raise ValueError("Invoice changed concurrently; credit note was rolled back")

    buyer_version = int(buyer.get("version", 1))
    buyer_version_filter = {"version": buyer_version}
    if "version" not in buyer:
        buyer_version_filter = {"version": {"$exists": False}}
    buyer_update = await db["commercial_buyers"].update_one(
        {"id": buyer["id"], **buyer_version_filter},
        {"$set": {
            "credit_balance_dt": Decimal128(buyer_credit_after),
            "credit_balance_updated_at": now,
            "credit_balance_updated_by": actor_user_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if buyer_update.matched_count != 1:
        raise ValueError("Buyer account changed concurrently; credit note was rolled back")

    return_update = await returns.update_one(
        {"id": return_id, "status": "RECEIVED",
         "commercial_acceptance_status": "PENDING",
         "version": command.expected_return_version},
        {"$set": {
            "commercial_acceptance_status": "ACCEPTED",
            "accepted_by": actor_user_id, "accepted_at": now,
            "acceptance_reason": command.reason,
            "acceptance_idempotency_scope": scope,
            "acceptance_idempotency_key": command.idempotency_key,
            "acceptance_fingerprint": fingerprint,
            "credit_note_id": credit_note_id,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if return_update.matched_count != 1:
        raise ValueError("Sale return changed concurrently; credit note was rolled back")

    await db["commercial_credit_notes"].insert_one(credit_note, session=session)
    await db["commercial_buyer_credit_ledger"].insert_one({
        "id": buyer_credit_entry_id, "buyer_id": buyer["id"],
        "credit_note_id": credit_note_id, "return_id": return_id,
        "invoice_id": invoice["id"], "entry_kind": "CREDIT_NOTE_ADJUSTMENT",
        "amount_delta_dt": Decimal128(credit_balance_delta),
        "balance_before_dt": Decimal128(buyer_credit_before),
        "balance_after_dt": Decimal128(buyer_credit_after),
        "created_by": actor_user_id, "created_at": now,
    }, session=session)
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_sale_return",
        "entity_id": return_id, "action": "SALE_RETURN_ACCEPTED_AND_CREDIT_NOTE_ISSUED",
        "actor_user_id": actor_user_id, "created_at": now,
        "details": {
            "credit_note_id": credit_note_id, "credit_note_number": number,
            "invoice_id": invoice["id"], "credit_amount_dt": Decimal128(credit_amount),
            "invoice_net_amount_dt": Decimal128(new_net),
            "outstanding_amount_dt": Decimal128(outstanding),
            "buyer_credit_delta_dt": Decimal128(credit_balance_delta),
            "buyer_credit_balance_dt": Decimal128(buyer_credit_after),
        },
    }, session=session)
    return credit_note
