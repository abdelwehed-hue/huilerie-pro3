"""Customer-owned oil purchases and the mill's payable-to-customer ledger."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.oil_purchases import OilPurchasePaymentDraft
from commercial.services.numbering import reserve_document_number


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def _fingerprint(value: Any) -> str:
    raw = json.dumps(value.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _decimal(value: Any) -> Decimal:
    return value.to_decimal() if hasattr(value, "to_decimal") else Decimal(str(value or "0"))


async def create_oil_purchase_document_for_transfer(
    db: Any, movement: dict[str, Any], draft: Any, *,
    season_code: str, actor_user_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    """Issue a BAH and optional first RPA in the same transaction as ownership transfer."""
    if draft.movement_kind != "OWNERSHIP_TRANSFER" or draft.consideration_type != "SALE":
        raise ValueError("An oil purchase document requires a sale ownership transfer")
    customer_id = draft.source_owner.customer_id
    owner = await db["commercial_custody_owners"].find_one(
        {"id": customer_id, "active": True}, {"_id": 0}, session=session
    )
    if not owner:
        raise ValueError("The customer ownership account could not be resolved")
    lot = await db["commercial_lots"].find_one(
        {"id": draft.lot_id}, {"_id": 0}, session=session
    )
    if not lot or lot.get("product_kind") != "OIL":
        raise ValueError("The source oil lot no longer exists")
    traceability_code = lot.get("batch_code")
    if not traceability_code:
        raise ValueError("The source oil lot has no traceability code")

    # Quality is tested once, in Laboratoire, on the preproduction sample.
    # Produced oil inherits that approval through its source olive lot; it is
    # never subjected to a second, post-pressing oil analysis.
    quality_assessment = None
    if lot.get("source_production_id"):
        source_olive_lot = await db["commercial_lots"].find_one(
            {"id": lot.get("source_olive_lot_id"), "product_kind": "OLIVE",
             "status": "OPEN", "batch_code": traceability_code,
             "preproduction_quality_status": "RELEASED",
             "preproduction_sample_id": {"$exists": True},
             "preproduction_quality_assessment_id": {"$exists": True},
             "latest_preproduction_sample_id": lot.get("source_preproduction_sample_id",
                 lot.get("latest_preproduction_sample_id", None))},
            {"_id": 0}, session=session,
        )
        # Older production records may not copy the sample ID to the output lot;
        # the source olive lot's current approved assessment remains authoritative.
        if not source_olive_lot:
            source_olive_lot = await db["commercial_lots"].find_one(
                {"id": lot.get("source_olive_lot_id"), "product_kind": "OLIVE",
                 "status": "OPEN", "batch_code": traceability_code,
                 "preproduction_quality_status": "RELEASED",
                 "preproduction_sample_id": {"$exists": True},
                 "preproduction_quality_assessment_id": {"$exists": True}},
                {"_id": 0}, session=session,
            )
        if source_olive_lot:
            sample = await db["commercial_preproduction_samples"].find_one(
                {"id": source_olive_lot.get("preproduction_sample_id"),
                 "status": "COMPLETED", "oil_sample_lot_id": {"$exists": True}},
                {"_id": 0}, session=session,
            )
            quality_assessment = await db["commercial_quality_assessments"].find_one(
                {"id": source_olive_lot.get("preproduction_quality_assessment_id"),
                 "oil_lot_id": sample.get("oil_sample_lot_id") if sample else None,
                 "status": "REVIEWED", "decision": "RELEASED"},
                {"_id": 0}, session=session,
            )
        if not source_olive_lot or not sample or not quality_assessment:
            raise ValueError("Only oil produced from a preproduction-sample-approved olive lot can be purchased by the mill")
    else:
        # Compatibility for non-production oil lots: require their own recorded release.
        if lot.get("quality_status") != "RELEASED":
            raise ValueError("Only quality-released oil can be purchased by the mill")
        if lot.get("last_quality_assessment_id"):
            quality_assessment = await db["commercial_quality_assessments"].find_one(
                {"id": lot["last_quality_assessment_id"], "oil_lot_id": draft.lot_id,
                 "status": "REVIEWED", "decision": "RELEASED"},
                {"_id": 0}, session=session,
            )
    tank = await db["commercial_tanks"].find_one(
        {"id": draft.source_location_id, "active": True, "role": {"$in": ["NORMAL", None]}},
        {"_id": 0}, session=session
    )
    if not tank:
        raise ValueError("The source oil tank is not an active normal tank")

    agreed = _money(draft.consideration_amount)
    unit_price = _money(agreed / draft.quantity_kg)
    paid = _money(draft.initial_payment_amount or Decimal("0"))
    outstanding = _money(agreed - paid)
    now = created_at.astimezone(timezone.utc)
    purchase_id = _stable_id("oil-purchase", movement["id"])
    number = await reserve_document_number(
        db["commercial_counters"], season_code, "BAH", session=session
    )
    status = "PAID" if outstanding == 0 else ("PARTIALLY_PAID" if paid > 0 else "UNPAID")
    document = {
        "id": purchase_id,
        "season_code": season_code,
        "document_type": "BAH",
        "document_number": number,
        "transfer_id": movement["id"],
        "customer_id": customer_id,
        "customer_name": owner.get("client_name"),
        "customer_phone": owner.get("client_phone"),
        "product_kind": "OIL",
        "lot_id": draft.lot_id,
        "traceability_code": traceability_code,
        "oil_type": quality_assessment.get("oil_type") if quality_assessment else None,
        "quality_classification": quality_assessment.get("classification") if quality_assessment else None,
        "quality_assessment_id": quality_assessment.get("id") if quality_assessment else None,
        "quantity_l": Decimal128(draft.quantity_kg),
        "tank_id": draft.source_location_id,
        "tank_code": tank.get("code"),
        "source_owner": draft.source_owner.model_dump(),
        "destination_owner": draft.destination_owner.model_dump(),
        "purchase_date": now.date().isoformat(),
        "unit_price_tnd_per_l": Decimal128(unit_price),
        "agreed_amount_tnd": Decimal128(agreed),
        "initial_paid_amount_tnd": Decimal128(paid),
        "initial_outstanding_amount_tnd": Decimal128(outstanding),
        "initial_payment_date": (draft.initial_payment_date or now.date()).isoformat() if paid > 0 else None,
        "initial_payment_method": draft.initial_payment_method if paid > 0 else None,
        "initial_payment_reference": draft.initial_payment_reference if paid > 0 else None,
        "paid_amount_tnd": Decimal128(paid),
        "outstanding_amount_tnd": Decimal128(outstanding),
        "currency": "TND",
        "payment_status": status,
        "initial_payment_status": status,
        "accounting_status": "PAYABLE_LEDGER_RECORDED",
        "version": 1,
        "created_by": actor_user_id,
        "created_at": now,
    }
    await db["commercial_oil_purchase_documents"].insert_one(document, session=session)

    if paid > 0:
        payment_id = _stable_id("oil-purchase-initial-payment", movement["id"])
        payment_number = await reserve_document_number(
            db["commercial_counters"], season_code, "RPA", session=session
        )
        payment = {
            "id": payment_id,
            "season_code": season_code,
            "document_type": "RPA",
            "document_number": payment_number,
            "purchase_document_id": purchase_id,
            "transfer_id": movement["id"],
            "customer_id": customer_id,
            "customer_name": owner.get("client_name"),
            "amount_tnd": Decimal128(paid),
            "payment_date": (draft.initial_payment_date or now.date()).isoformat(),
            "method": draft.initial_payment_method,
            "reference": draft.initial_payment_reference,
            "currency": "TND",
            "idempotency_scope": f"{season_code}:{actor_user_id}",
            "idempotency_key": f"initial-oil-purchase:{movement['id']}",
            "request_fingerprint": hashlib.sha256(
                f"{movement['id']}:{paid}:{draft.initial_payment_method}:{draft.initial_payment_reference or ''}".encode()
            ).hexdigest(),
            "created_by": actor_user_id,
            "created_at": now,
        }
        await db["commercial_oil_purchase_payments"].insert_one(payment, session=session)
    movement["oil_purchase_document_id"] = purchase_id
    movement["oil_purchase_document_number"] = number
    movement["consideration"] = {
        **(movement.get("consideration") or {}),
        "accounting_status": "PAYABLE_LEDGER_RECORDED",
        "payment_status": status,
        "purchase_document_id": purchase_id,
        "purchase_document_number": number,
        "paid_amount": Decimal128(paid),
        "outstanding_amount": Decimal128(outstanding),
    }
    movement_update = await db["commercial_internal_movements"].update_one(
        {"id": movement["id"], "status": "APPROVED"},
        {"$set": {
            "oil_purchase_document_id": purchase_id,
            "oil_purchase_document_number": number,
            "consideration": movement["consideration"],
        }},
        session=session,
    )
    if movement_update.matched_count != 1:
        raise ValueError("Approved ownership transfer could not be linked to its oil purchase document")
    await db["commercial_audit_events"].insert_one({
        "id": _stable_id("oil-purchase-audit", movement["id"]),
        "entity_type": "commercial_oil_purchase",
        "entity_id": purchase_id,
        "action": "OIL_PURCHASE_DOCUMENT_ISSUED",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "document_number": number,
            "transfer_id": movement["id"],
            "customer_id": customer_id,
            "traceability_code": traceability_code,
            "oil_type": document["oil_type"],
            "quality_classification": document["quality_classification"],
            "quantity_l": Decimal128(draft.quantity_kg),
            "unit_price_tnd_per_l": Decimal128(unit_price),
            "agreed_amount_tnd": Decimal128(agreed),
            "paid_amount_tnd": Decimal128(paid),
            "initial_payment_method": draft.initial_payment_method,
            "initial_payment_reference": draft.initial_payment_reference,
            "outstanding_amount_tnd": Decimal128(outstanding),
            "payment_status": status,
        },
    }, session=session)
    return document


async def assert_oil_purchase_payments_reconcile(
    db: Any, purchase: dict[str, Any], *, session: Any,
) -> None:
    payments = await db["commercial_oil_purchase_payments"].find(
        {"purchase_document_id": purchase["id"]}, {"_id": 0, "amount_tnd": 1},
        session=session,
    ).to_list(10000)
    paid = _money(sum((_decimal(item.get("amount_tnd")) for item in payments), Decimal("0")))
    agreed = _money(_decimal(purchase.get("agreed_amount_tnd")))
    stored_paid = _money(_decimal(purchase.get("paid_amount_tnd")))
    stored_outstanding = _money(_decimal(purchase.get("outstanding_amount_tnd")))
    if (
        paid != stored_paid
        or paid > agreed
        or _money(agreed - paid) != stored_outstanding
    ):
        raise ValueError("Oil purchase payment ledger does not reconcile with the purchase balance")


async def record_oil_purchase_payment(
    db: Any, purchase_id: str, draft: OilPurchasePaymentDraft, *,
    season_code: str, actor_user: dict[str, Any], actor_user_id: str,
    payment_id: str, audit_event_id: str, created_at: datetime, session: Any,
) -> dict[str, Any]:
    require_commercial_permission(actor_user, "commercial.manage_sales")
    if not actor_user_id or not payment_id or not audit_event_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable IDs, and timezone-aware timestamp are required")
    purchases = db["commercial_oil_purchase_documents"]
    purchase = await purchases.find_one({"id": purchase_id}, {"_id": 0}, session=session)
    if not purchase:
        raise ValueError("Oil purchase document does not exist")
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    payments = db["commercial_oil_purchase_payments"]
    prior = await payments.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint or prior.get("purchase_document_id") != purchase_id:
            raise ValueError("Payment idempotency key was used for a different oil purchase payment")
        return prior
    if purchase.get("payment_status") == "PAID" or purchase.get("version") != draft.expected_purchase_version:
        raise ValueError("Oil purchase is already paid or its version has changed")
    await assert_oil_purchase_payments_reconcile(db, purchase, session=session)
    outstanding = _decimal(purchase.get("outstanding_amount_tnd"))
    amount = _money(draft.amount_tnd)
    if amount > outstanding:
        raise ValueError("Payment exceeds the amount owed to the customer")

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "RPA", session=session
    )
    now = created_at.astimezone(timezone.utc)
    payment = {
        "id": payment_id,
        "season_code": season_code,
        "document_type": "RPA",
        "document_number": number,
        "purchase_document_id": purchase_id,
        "transfer_id": purchase["transfer_id"],
        "customer_id": purchase["customer_id"],
        "customer_name": purchase.get("customer_name"),
        "amount_tnd": Decimal128(amount),
        "payment_date": draft.payment_date.isoformat(),
        "method": draft.method,
        "reference": draft.reference,
        "currency": "TND",
        "notes": draft.notes,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }
    await payments.insert_one(payment, session=session)
    paid = _money(_decimal(purchase.get("paid_amount_tnd")) + amount)
    remaining = _money(outstanding - amount)
    status = "PAID" if remaining == 0 else "PARTIALLY_PAID"
    update = await purchases.update_one(
        {"id": purchase_id, "version": draft.expected_purchase_version,
         "outstanding_amount_tnd": purchase["outstanding_amount_tnd"]},
        {"$set": {
            "paid_amount_tnd": Decimal128(paid),
            "outstanding_amount_tnd": Decimal128(remaining),
            "payment_status": status,
            "updated_at": now,
        }, "$inc": {"version": 1}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Oil purchase changed concurrently; payment was rolled back")
    movement_update = await db["commercial_internal_movements"].update_one(
        {"id": purchase["transfer_id"]},
        {"$set": {
            "consideration.payment_status": status,
            "consideration.paid_amount": Decimal128(paid),
            "consideration.outstanding_amount": Decimal128(remaining),
        }},
        session=session,
    )
    if movement_update.matched_count != 1:
        raise ValueError("The source ownership transfer record is missing; payment was rolled back")
    await db["commercial_audit_events"].insert_one({
        "id": audit_event_id,
        "entity_type": "commercial_oil_purchase",
        "entity_id": purchase_id,
        "action": "OIL_PURCHASE_PAYMENT_RECORDED",
        "actor_user_id": actor_user_id,
        "created_at": now,
        "details": {
            "payment_id": payment_id,
            "payment_number": number,
            "amount_tnd": Decimal128(amount),
            "previous_paid_amount_tnd": purchase["paid_amount_tnd"],
            "new_paid_amount_tnd": Decimal128(paid),
            "previous_outstanding_amount_tnd": purchase["outstanding_amount_tnd"],
            "new_outstanding_amount_tnd": Decimal128(remaining),
            "payment_status": status,
        },
    }, session=session)
    return payment
