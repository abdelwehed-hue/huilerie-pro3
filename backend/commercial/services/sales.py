"""Atomic wholesale sales, commercial invoices, and payment posting."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.schemas.sales import (
    ApproveWholesaleSaleCommand, SalePaymentDraft, WholesaleSaleDraft,
)
from commercial.services.numbering import reserve_document_number
from commercial.services.payment_ledger import assert_invoice_receivable_fields_reconcile
from commercial.services.stock_ledger import post_stock_movement


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _fingerprint(value: Any) -> str:
    raw = json.dumps(value.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


async def _require_released_quality_evidence(db: Any, lot: dict[str, Any], *, session: Any) -> None:
    """Require a reviewed release, without imposing an Extra-Vierge classification."""
    production_id = lot.get("source_production_id")
    if production_id:
        production = await db["commercial_productions"].find_one(
            {"id": production_id, "status": "COMPLETED", "output_oil_lot_id": lot["id"]},
            {"_id": 0, "preproduction_quality_approvals": 1}, session=session,
        )
        approvals = (production or {}).get("preproduction_quality_approvals") or []
        if not approvals:
            raise ValueError("Oil cannot be sold without a recorded preproduction quality analysis")
        for evidence in approvals:
            olive_lot_id = evidence.get("olive_lot_id")
            sample_id = evidence.get("sample_id")
            sample_oil_lot_id = evidence.get("sample_oil_lot_id")
            assessment_id = evidence.get("assessment_id")
            if not all((olive_lot_id, sample_id, sample_oil_lot_id, assessment_id)):
                raise ValueError("Production quality evidence is incomplete; oil cannot be sold")
            olive_lot = await db["commercial_lots"].find_one(
                {"id": olive_lot_id, "product_kind": "OLIVE",
                 "preproduction_quality_status": "RELEASED",
                 "preproduction_sample_id": sample_id,
                 "latest_preproduction_sample_id": sample_id,
                 "preproduction_quality_assessment_id": assessment_id},
                {"_id": 0, "id": 1}, session=session,
            )
            sample = await db["commercial_preproduction_samples"].find_one(
                {"id": sample_id, "status": "COMPLETED",
                 "oil_sample_lot_id": sample_oil_lot_id,
                 "$or": [{"source_olive_lot_id": olive_lot_id},
                         {"source_olive_lot_ids": olive_lot_id}]},
                {"_id": 0, "id": 1}, session=session,
            )
            assessment = await db["commercial_quality_assessments"].find_one(
                {"id": assessment_id, "oil_lot_id": sample_oil_lot_id,
                 "status": "REVIEWED", "decision": "RELEASED"},
                {"_id": 0, "id": 1}, session=session,
            )
            if not olive_lot or not sample or not assessment:
                raise ValueError("Oil cannot be sold: its preproduction quality analysis is missing, rejected, or superseded")
        return

    assessment_id = lot.get("last_quality_assessment_id")
    if lot.get("quality_status") != "RELEASED" or not assessment_id:
        raise ValueError("Oil cannot be sold without a reviewed and released laboratory analysis")
    assessment = await db["commercial_quality_assessments"].find_one(
        {"id": assessment_id, "oil_lot_id": lot["id"],
         "status": "REVIEWED", "decision": "RELEASED"},
        {"_id": 0, "id": 1}, session=session,
    )
    if not assessment:
        raise ValueError("Oil cannot be sold: its laboratory analysis is missing, rejected, or superseded")


async def create_wholesale_sale_draft(
    db: Any, draft: WholesaleSaleDraft, *, season_code: str,
    actor_user: dict[str, Any], actor_user_id: str, sale_id: str,
    audit_event_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not sale_id or not audit_event_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable IDs, and timezone-aware timestamp are required")
    buyer = await db["commercial_buyers"].find_one(
        {"id": draft.buyer_id, "active": True}, {"_id": 0, "id": 1}, session=session
    )
    if not buyer:
        raise ValueError("Unknown or inactive commercial buyer")
    tank = await db["commercial_tanks"].find_one(
        {"id": draft.source_tank_id, "active": True, "role": {"$in": ["NORMAL", None]}},
        {"_id": 0, "id": 1}, session=session,
    )
    if not tank:
        raise ValueError("Source tank does not exist, is inactive, or is not a normal sale tank")
    # Sales are tank-based: count all positive mill-owned oil balances in this
    # active normal tank. Lot status/purpose/quality restrictions are deliberately
    # not applied; FIFO allocation is performed at approval time.
    balances = await db["commercial_stock_balances"].find(
        {"product_kind": "OIL", "location_id": draft.source_tank_id,
         "owner.kind": "MILL", "quantity_kg": {"$gt": Decimal128("0.000")}},
        {"_id": 0, "quantity_kg": 1},
        session=session,
    ).to_list(500)
    available = Decimal("0")
    for balance in balances:
        raw = balance.get("quantity_kg", Decimal128("0.000"))
        available += raw.to_decimal() if hasattr(raw, "to_decimal") else Decimal(str(raw))
    if available < draft.quantity_kg:
        raise ValueError("Insufficient mill-owned oil stock in the selected tank")
    collection = db["commercial_sales"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await collection.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was used for a different sale request")
        return prior
    number = await reserve_document_number(
        db["commercial_counters"], season_code, "VTE", session=session
    )
    now = created_at.astimezone(timezone.utc)
    record = {
        "id": sale_id, "season_code": season_code, "document_type": "VTE",
        "document_number": number, "sale_date": draft.sale_date.isoformat(),
        "buyer_id": draft.buyer_id, "oil_lot_id": None, "batch_code": None,
        "source_tank_id": draft.source_tank_id,
        "quantity_kg": Decimal128(draft.quantity_kg),
        "unit_price_dt": Decimal128(draft.unit_price_dt),
        "total_amount_dt": Decimal128(_money(draft.quantity_kg * draft.unit_price_dt)),
        "notes": draft.notes, "status": "DRAFT", "version": 1,
        "idempotency_scope": scope, "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint, "created_by": actor_user_id,
        "created_at": now, "updated_at": now,
    }
    await collection.insert_one(record, session=session)
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_sale", "entity_id": sale_id,
        "action": "SALE_DRAFT_CREATED", "actor_user_id": actor_user_id,
        "created_at": now, "details": {"document_number": number, "buyer_id": draft.buyer_id,
            "source_tank_id": draft.source_tank_id, "quantity_kg": record["quantity_kg"],
            "unit_price_dt": record["unit_price_dt"],
            "total_amount_dt": record["total_amount_dt"], "status": "DRAFT"},
    }, session=session)
    return record


async def approve_wholesale_sale(
    db: Any, sale_id: str, command: ApproveWholesaleSaleCommand, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    invoice_id: str, stock_movement_id: str, audit_event_id: str,
    created_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_sales")
    require_commercial_permission(actor_user, "commercial.post_stock")
    if not actor_user_id or not all((sale_id, invoice_id, stock_movement_id, audit_event_id)):
        raise ValueError("Stable actor and document identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    sales = db["commercial_sales"]
    sale = await sales.find_one({"id": sale_id}, {"_id": 0}, session=session)
    if not sale:
        raise ValueError("Wholesale sale does not exist")
    command_fingerprint = _fingerprint(command)
    if sale.get("status") == "APPROVED":
        if (sale.get("approval_idempotency_scope") == f"{season_code}:{actor_user_id}"
                and sale.get("approval_idempotency_key") == command.idempotency_key
                and sale.get("approval_fingerprint") == command_fingerprint):
            return sale
        raise ValueError("Wholesale sale has already been approved or changed")
    if sale.get("status") != "DRAFT" or sale.get("version") != command.expected_version:
        raise ValueError("Wholesale sale version conflict")

    buyer = await db["commercial_buyers"].find_one(
        {"id": sale["buyer_id"], "active": True}, {"_id": 0, "id": 1}, session=session
    )
    if not buyer:
        raise ValueError("Buyer is unknown or inactive")
    tank = await db["commercial_tanks"].find_one(
        {"id": sale["source_tank_id"], "active": True, "role": {"$in": ["NORMAL", None]}},
        {"_id": 0, "id": 1}, session=session,
    )
    if not tank:
        raise ValueError("Source tank does not exist, is inactive, or is not a normal sale tank")

    balances = await db["commercial_stock_balances"].find(
        {"product_kind": "OIL", "location_id": sale["source_tank_id"],
         "owner.kind": "MILL", "quantity_kg": {"$gt": Decimal128("0.000")}},
        {"_id": 0, "lot_id": 1, "quantity_kg": 1, "created_at": 1},
        session=session,
    ).sort([("created_at", 1), ("lot_id", 1)]).to_list(500)
    fifo_balances = []
    for balance in balances:
        lot = await db["commercial_lots"].find_one(
            {"id": balance["lot_id"], "product_kind": "OIL"},
            {"_id": 0, "id": 1, "batch_code": 1, "quality_status": 1,
             "last_quality_assessment_id": 1, "source_production_id": 1},
            session=session,
        )
        if not lot:
            continue
        raw = balance.get("quantity_kg", Decimal128("0.000"))
        quantity = raw.to_decimal() if hasattr(raw, "to_decimal") else Decimal(str(raw))
        if quantity > 0:
            fifo_balances.append((balance, lot, quantity))
    remaining = sale["quantity_kg"].to_decimal()
    allocations = []
    for balance, lot, available in fifo_balances:
        if remaining <= 0:
            break
        taken = min(available, remaining)
        await _require_released_quality_evidence(db, lot, session=session)
        allocations.append({
            "lot_id": lot["id"], "batch_code": lot.get("batch_code"),
            "quantity_kg": Decimal128(taken),
            "quality_status": lot.get("quality_status", "UNSET"),
        })
        remaining -= taken
    if remaining > 0:
        raise ValueError("Insufficient mill-owned oil stock in the selected tank")

    now = created_at.astimezone(timezone.utc)
    invoice_number = await reserve_document_number(
        db["commercial_counters"], season_code, "FAC", session=session
    )
    first_quality = allocations[0]["quality_status"] if allocations else "UNSET"
    update = await sales.update_one(
        {"id": sale_id, "status": "DRAFT", "version": command.expected_version},
        {"$set": {
            "status": "APPROVED", "approved_by": actor_user_id, "approved_at": now,
            "approval_idempotency_scope": f"{season_code}:{actor_user_id}",
            "approval_idempotency_key": command.idempotency_key,
            "approval_fingerprint": command_fingerprint,
            "invoice_id": invoice_id, "oil_lot_id": None, "batch_code": None,
            "dispatch_allocations": allocations,
            "quality_status_at_dispatch": first_quality, "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Wholesale sale changed concurrently")

    invoice = {
        "id": invoice_id, "season_code": season_code, "document_type": "FAC",
        "document_number": invoice_number, "sale_id": sale_id,
        "sale_document_number": sale["document_number"], "buyer_id": sale["buyer_id"],
        "batch_code": None, "dispatch_allocations": allocations,
        "quality_status_at_sale": first_quality,
        "sale_date": sale["sale_date"], "quantity_kg": sale["quantity_kg"],
        "unit_price_dt": sale["unit_price_dt"], "total_amount_dt": sale["total_amount_dt"],
        "paid_amount_dt": Decimal128("0.000"),
        "applied_credit_amount_dt": Decimal128("0.000"),
        "credited_amount_dt": Decimal128("0.000"),
        "net_amount_dt": sale["total_amount_dt"],
        "outstanding_amount_dt": sale["total_amount_dt"],
        "payment_status": "UNPAID", "version": 1,
        "tax_treatment_status": "NOT_CONFIGURED",
        "created_by": actor_user_id, "created_at": now,
    }
    await db["commercial_sales_invoices"].insert_one(invoice, session=session)

    for index, allocation in enumerate(allocations):
        movement_id = stock_movement_id if index == 0 else _stable_id(
            "sale-dispatch-movement", f"{sale_id}:{command.idempotency_key}:{allocation['lot_id']}"
        )
        await post_stock_movement(
            db,
            StockMovementDraft(
                movement_kind="DISPATCH", product_kind="OIL",
                lot_id=allocation["lot_id"], quantity_kg=allocation["quantity_kg"].to_decimal(),
                source_location_id=sale["source_tank_id"],
                source_owner=OwnerRef(kind="MILL"),
                source_document_type="VTE", source_document_id=sale_id,
                idempotency_key=hashlib.sha256(
                    f"sale-dispatch:{sale_id}:{command.idempotency_key}:{allocation['lot_id']}".encode()
                ).hexdigest(),
                reason=f"Wholesale dispatch {sale['document_number']} (FIFO {index + 1})",
            ),
            season_code=season_code, actor_user_id=actor_user_id, actor_user=actor_user,
            movement_id=movement_id,
            audit_event_id=_stable_id(
                "sale-dispatch-audit", f"{sale_id}:{command.idempotency_key}:{allocation['lot_id']}"
            ),
            created_at=created_at, session=session,
        )
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_sale", "entity_id": sale_id,
        "action": "SALE_APPROVED_AND_DISPATCHED", "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "sale_number": sale["document_number"], "invoice_number": invoice_number,
            "buyer_id": sale["buyer_id"], "dispatch_allocations": allocations,
            "quality_status_at_dispatch": first_quality,
            "source_tank_id": sale.get("source_tank_id"),
            "sale_date": sale.get("sale_date"),
            "quantity_kg": sale["quantity_kg"], "unit_price_dt": sale["unit_price_dt"],
            "total_amount_dt": sale["total_amount_dt"],
            "previous_status": "DRAFT", "new_status": "APPROVED",
            "previous_version": command.expected_version,
            "new_version": command.expected_version + 1,
            "invoice_receivable_before_dt": Decimal128("0.000"),
            "invoice_receivable_after_dt": invoice["outstanding_amount_dt"],
            "stock_movement_id": stock_movement_id,
        },
    }, session=session)
    return await sales.find_one({"id": sale_id}, {"_id": 0}, session=session)


async def record_sale_payment(
    db: Any, invoice_id: str, draft: SalePaymentDraft, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    payment_id: str, audit_event_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not payment_id or not audit_event_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable IDs, and timezone-aware timestamp are required")
    invoices = db["commercial_sales_invoices"]
    invoice = await invoices.find_one({"id": invoice_id}, {"_id": 0}, session=session)
    if not invoice:
        raise ValueError("Commercial sales invoice does not exist")
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    payments = db["commercial_sale_payments"]
    prior = await payments.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint or prior.get("invoice_id") != invoice_id:
            raise ValueError("Payment idempotency key was used for a different request")
        return prior
    if invoice.get("payment_status") == "PAID" or invoice.get("version") != draft.expected_invoice_version:
        raise ValueError("Invoice is already paid or its version has changed")
    await assert_invoice_receivable_fields_reconcile(db, invoice, session=session)
    outstanding = invoice["outstanding_amount_dt"].to_decimal()
    amount = _money(draft.amount_dt)
    if amount > outstanding:
        raise ValueError("Payment exceeds the outstanding invoice balance")

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "PAY", session=session
    )
    now = created_at.astimezone(timezone.utc)
    payment = {
        "id": payment_id, "season_code": season_code, "document_type": "PAY",
        "document_number": number, "invoice_id": invoice_id,
        "sale_id": invoice["sale_id"], "amount_dt": Decimal128(amount),
        "payment_date": draft.payment_date.isoformat(), "method": draft.method,
        "reference": draft.reference, "notes": draft.notes,
        "idempotency_scope": scope, "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint, "created_by": actor_user_id, "created_at": now,
    }
    await payments.insert_one(payment, session=session)
    paid = invoice["paid_amount_dt"].to_decimal() + amount
    applied_credit = invoice.get("applied_credit_amount_dt", Decimal128("0.000")).to_decimal()
    remaining = outstanding - amount
    status = "PAID" if remaining == Decimal("0.000") else (
        "PARTIALLY_PAID" if paid + applied_credit > Decimal("0.000") else "UNPAID"
    )
    update = await invoices.update_one(
        {"id": invoice_id, "version": draft.expected_invoice_version,
         "outstanding_amount_dt": invoice["outstanding_amount_dt"]},
        {"$set": {
            "paid_amount_dt": Decimal128(paid),
            "outstanding_amount_dt": Decimal128(remaining),
            "payment_status": status, "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Invoice changed concurrently; payment was rolled back")
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_sales_invoice",
        "entity_id": invoice_id, "action": "PAYMENT_RECORDED",
        "actor_user_id": actor_user_id, "created_at": now,
        "details": {"payment_id": payment_id, "payment_number": number,
                    "amount_dt": Decimal128(amount), "payment_method": draft.method,
                    "previous_paid_amount_dt": invoice["paid_amount_dt"],
                    "new_paid_amount_dt": Decimal128(paid),
                    "previous_outstanding_amount_dt": invoice["outstanding_amount_dt"],
                    "new_outstanding_amount_dt": Decimal128(remaining),
                    "previous_payment_status": invoice["payment_status"],
                    "new_payment_status": status},
    }, session=session)
    return payment


async def cancel_wholesale_sale_draft(
    db: Any, sale_id: str, command: Any, *,
    actor_user: dict[str, Any], actor_user_id: str,
    audit_event_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    """Cancel a draft only; posted stock/invoice effects are never reversed here."""
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not sale_id or not audit_event_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable IDs, and timezone-aware timestamp are required")
    sales = db["commercial_sales"]
    sale = await sales.find_one({"id": sale_id}, {"_id": 0}, session=session)
    if not sale:
        raise ValueError("Wholesale sale does not exist")
    if sale.get("status") == "CANCELLED":
        if (sale.get("cancelled_by") == actor_user_id
                and sale.get("cancellation_idempotency_key") == command.idempotency_key
                and sale.get("cancellation_reason") == command.reason):
            return sale
        raise ValueError("Wholesale sale has already been cancelled")
    if sale.get("status") != "DRAFT":
        raise ValueError("Only a draft wholesale sale can be cancelled")
    if sale.get("version") != command.expected_version:
        raise ValueError("Wholesale sale version conflict")

    now = created_at.astimezone(timezone.utc)
    update = await sales.update_one(
        {"id": sale_id, "status": "DRAFT", "version": command.expected_version},
        {"$set": {
            "status": "CANCELLED", "cancellation_reason": command.reason,
            "cancellation_idempotency_key": command.idempotency_key,
            "cancelled_by": actor_user_id, "cancelled_at": now, "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Wholesale sale changed concurrently")
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id, "entity_type": "commercial_sale", "entity_id": sale_id,
        "action": "SALE_DRAFT_CANCELLED", "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "sale_number": sale.get("document_number"),
            "reason": command.reason,
            "previous_status": "DRAFT", "new_status": "CANCELLED",
            "previous_version": command.expected_version,
            "version": command.expected_version + 1,
        },
    }, session=session)
    return await sales.find_one({"id": sale_id}, {"_id": 0}, session=session)
