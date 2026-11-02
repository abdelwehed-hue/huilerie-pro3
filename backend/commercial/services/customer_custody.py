"""Atomic intake and pickup workflows for customer-owned commercial stock."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.customer_custody import (
    CustomerOliveCustodyReceiptDraft,
    CustomerOilCustodyReleaseDraft,
)
from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _fingerprint(command: Any) -> str:
    raw = json.dumps(command.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _movement_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def _get_or_create_custody_owner(
    db: Any, phone: str, owner_id: str, *, created_at: datetime, session: Any
) -> dict[str, Any]:
    client = await db["clients"].find_one(
        {"phone": phone}, {"phone": 1, "client_name": 1}, session=session
    )
    if not client:
        legacy_load = await db["loads"].find_one(
            {"phone": phone}, {"_id": 0, "phone": 1, "client_name": 1},
            sort=[("created_at", -1)], session=session,
        )
        if not legacy_load:
            raise ValueError("Customer must exist in the mill client directory before custody intake")
        # Normalize an established legacy customer into the client directory once.
        inserted = await db["clients"].insert_one(
            {
                "phone": phone,
                "client_name": legacy_load.get("client_name"),
                "created_at": created_at.astimezone(timezone.utc),
            },
            session=session,
        )
        client = {
            "_id": inserted.inserted_id,
            "phone": phone,
            "client_name": legacy_load.get("client_name"),
        }

    legacy_client_id = str(client["_id"])
    name = str(client.get("client_name") or "").strip()
    if not name:
        raise ValueError("Customer record has no valid display name")

    existing = await db["commercial_custody_owners"].find_one(
        {"legacy_client_id": legacy_client_id}, {"_id": 0}, session=session
    )
    if existing:
        if not existing.get("active", True):
            raise ValueError("Customer custody account is inactive")
        if existing.get("client_phone") != phone or existing.get("client_name") != name:
            await db["commercial_custody_owners"].update_one(
                {"id": existing["id"], "version": existing.get("version", 1)},
                {
                    "$set": {
                        "client_phone": phone,
                        "client_name": name,
                        "updated_at": created_at.astimezone(timezone.utc),
                    },
                    "$inc": {"version": 1},
                },
                session=session,
            )
            existing.update({
                "client_phone": phone,
                "client_name": name,
                "version": existing.get("version", 1) + 1,
            })
        return existing

    phone_owner = await db["commercial_custody_owners"].find_one(
        {"client_phone": phone}, {"_id": 0, "id": 1}, session=session
    )
    if phone_owner:
        raise ValueError("Customer phone is already linked to another custody owner")

    owner = {
        "id": owner_id,
        "legacy_client_id": legacy_client_id,
        "client_phone": phone,
        "client_name": name,
        "active": True,
        "version": 1,
        "created_at": created_at.astimezone(timezone.utc),
    }
    await db["commercial_custody_owners"].insert_one(owner, session=session)
    return owner

async def receive_customer_olive_custody(
    db: Any,
    draft: CustomerOliveCustodyReceiptDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    receipt_id: str,
    custody_owner_id: str,
    olive_lot_id: str,
    stock_movement_id: str,
    audit_event_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Receive customer-owned olives without recording a purchase or mill asset."""
    require_commercial_permission(actor_user, "commercial.manage_custody")
    if not actor_user_id or not all((receipt_id, custody_owner_id, olive_lot_id, stock_movement_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable custody identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    receipts = db["commercial_customer_custody_receipts"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await receipts.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Custody receipt idempotency key was used for a different request")
        return prior

    owner = await _get_or_create_custody_owner(
        db, draft.customer_phone, custody_owner_id, created_at=created_at, session=session
    )
    variety = await db["commercial_varieties"].find_one(
        {"id": draft.variety_id, "active": True}, {"_id": 0, "id": 1}, session=session
    )
    if not variety:
        raise ValueError("Unknown or inactive commercial olive variety")
    location = await db["commercial_locations"].find_one(
        {"id": draft.receiving_location_id, "active": True,
         "kind": {"$in": ["OLIVE_STORAGE", "STAGING"]}},
        {"_id": 0, "id": 1}, session=session,
    )
    if not location:
        raise ValueError("Unknown or inactive olive receiving location")

    receipt_number = await reserve_document_number(
        db["commercial_counters"], season_code, "CIN", session=session
    )
    lot_number = await reserve_document_number(
        db["commercial_counters"], season_code, "LOT", session=session
    )
    now = created_at.astimezone(timezone.utc)
    owner_ref = OwnerRef(kind="CUSTOMER", customer_id=owner["id"])
    receipt = {
        "id": receipt_id,
        "season_code": season_code,
        "document_type": "CIN",
        "document_number": receipt_number,
        "customer_id": owner["id"],
        "customer_phone": owner["client_phone"],
        "customer_name": owner["client_name"],
        "olive_lot_id": olive_lot_id,
        "variety_id": draft.variety_id,
        "quantity_kg": Decimal128(draft.quantity_kg),
        "receiving_location_id": draft.receiving_location_id,
        "receipt_date": draft.receipt_date.isoformat(),
        "customer_acknowledgement_reference": draft.customer_acknowledgement_reference,
        "source_reference": draft.source_reference,
        "notes": draft.notes,
        "status": "RECEIVED",
        "version": 1,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }
    lot = {
        "id": olive_lot_id,
        "season_code": season_code,
        "document_type": "LOT",
        "document_number": lot_number,
        "product_kind": "OLIVE",
        "variety_id": draft.variety_id,
        "source_customer_custody_receipt_id": receipt_id,
        "quantity_received_kg": Decimal128(draft.quantity_kg),
        "owner": {"kind": "CUSTOMER", "customer_id": owner["id"]},
        "quality_status": "PENDING",
        "status": "OPEN",
        "version": 1,
        "created_by": actor_user_id,
        "created_at": now,
    }
    await receipts.insert_one(receipt, session=session)
    await db["commercial_lots"].insert_one(lot, session=session)

    movement_key = f"customer-olive-custody:{receipt_id}:{draft.idempotency_key}"
    ledger = await post_stock_movement(
        db,
        StockMovementDraft(
            movement_kind="RECEIPT",
            product_kind="OLIVE",
            lot_id=olive_lot_id,
            quantity_kg=draft.quantity_kg,
            destination_location_id=draft.receiving_location_id,
            destination_owner=owner_ref,
            source_document_type="CIN",
            source_document_id=receipt_id,
            idempotency_key=_movement_key(movement_key),
            reason=f"Customer-owned olive custody receipt {receipt_number}",
        ),
        season_code=season_code,
        actor_user_id=actor_user_id,
        actor_user=actor_user,
        movement_id=stock_movement_id,
        audit_event_id=f"{audit_event_id}:movement",
        created_at=created_at,
        session=session,
    )
    await receipts.update_one(
        {"id": receipt_id, "status": "RECEIVED"},
        {"$set": {"stock_movement_id": ledger["id"]}},
        session=session,
    )
    await db["commercial_audit_events"].insert_one(
        {
            "id": audit_event_id,
            "entity_type": "customer_custody_receipt",
            "entity_id": receipt_id,
            "action": "CUSTOMER_OLIVES_RECEIVED_IN_CUSTODY",
            "actor_user_id": actor_user_id,
            "created_at": now,
            "details": {
                "document_number": receipt_number,
                "customer_id": owner["id"],
                "olive_lot_id": olive_lot_id,
                "lot_number": lot_number,
                "quantity_kg": Decimal128(draft.quantity_kg),
                "receiving_location_id": draft.receiving_location_id,
            },
        },
        session=session,
    )
    return await receipts.find_one({"id": receipt_id}, {"_id": 0}, session=session)


async def release_customer_oil_custody(
    db: Any,
    draft: CustomerOilCustodyReleaseDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    release_id: str,
    stock_movement_id: str,
    audit_event_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Release customer-owned, quality-released oil to its owner without a sale."""
    require_commercial_permission(actor_user, "commercial.manage_custody")
    if not actor_user_id or not all((release_id, stock_movement_id, audit_event_id)):
        raise ValueError("Authenticated actor and stable custody identifiers are required")
    if created_at.tzinfo is None:
        raise ValueError("created_at must be timezone-aware")

    releases = db["commercial_customer_custody_releases"]
    scope = f"{season_code}:{actor_user_id}"
    fingerprint = _fingerprint(draft)
    prior = await releases.find_one(
        {"idempotency_scope": scope, "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Custody release idempotency key was used for a different request")
        return prior

    owner = await db["commercial_custody_owners"].find_one(
        {"id": draft.customer_id}, {"_id": 0}, session=session
    )
    if not owner:
        raise ValueError("Customer custody account does not exist")
    lot = await db["commercial_lots"].find_one(
        {"id": draft.oil_lot_id, "product_kind": "OIL", "status": "OPEN"},
        {"_id": 0, "id": 1, "owner": 1, "quality_status": 1}, session=session,
    )
    if not lot:
        raise ValueError("Customer oil lot does not exist or is closed")
    expected_owner = {"kind": "CUSTOMER", "customer_id": owner["id"]}
    if lot.get("owner") != expected_owner:
        raise ValueError("Selected oil lot does not belong to this customer")
    if lot.get("quality_status") != "RELEASED":
        raise ValueError("Customer oil cannot be picked up before independent quality release")
    tank = await db["commercial_tanks"].find_one(
        {"id": draft.source_tank_id, "active": True, "role": {"$ne": "QUARANTINE"}},
        {"_id": 0, "id": 1}, session=session,
    )
    if not tank:
        raise ValueError("Customer oil pickup requires an active normal storage tank")

    number = await reserve_document_number(
        db["commercial_counters"], season_code, "CUS", session=session
    )
    now = created_at.astimezone(timezone.utc)
    release = {
        "id": release_id,
        "season_code": season_code,
        "document_type": "CUS",
        "document_number": number,
        "customer_id": owner["id"],
        "customer_phone": owner["client_phone"],
        "customer_name": owner["client_name"],
        "oil_lot_id": draft.oil_lot_id,
        "source_tank_id": draft.source_tank_id,
        "quantity_kg": Decimal128(draft.quantity_kg),
        "release_date": draft.release_date.isoformat(),
        "customer_acknowledgement_reference": draft.customer_acknowledgement_reference,
        "reason": draft.reason,
        "status": "APPROVED",
        "version": 1,
        "idempotency_scope": scope,
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_by": actor_user_id,
        "created_at": now,
    }
    await releases.insert_one(release, session=session)

    ledger = await post_stock_movement(
        db,
        StockMovementDraft(
            movement_kind="DISPATCH",
            product_kind="OIL",
            lot_id=draft.oil_lot_id,
            quantity_kg=draft.quantity_kg,
            source_location_id=draft.source_tank_id,
            source_owner=OwnerRef(kind="CUSTOMER", customer_id=owner["id"]),
            source_document_type="CUS",
            source_document_id=release_id,
            idempotency_key=_movement_key(f"customer-oil-pickup:{release_id}:{draft.idempotency_key}"),
            reason=f"Customer-owned oil released under {number}",
        ),
        season_code=season_code,
        actor_user_id=actor_user_id,
        actor_user=actor_user,
        movement_id=stock_movement_id,
        audit_event_id=f"{audit_event_id}:movement",
        created_at=created_at,
        session=session,
    )
    await releases.update_one(
        {"id": release_id, "status": "APPROVED"},
        {"$set": {"stock_movement_id": ledger["id"]}},
        session=session,
    )
    await db["commercial_audit_events"].insert_one(
        {
            "id": audit_event_id,
            "entity_type": "customer_custody_release",
            "entity_id": release_id,
            "action": "CUSTOMER_OWNED_OIL_RELEASED",
            "actor_user_id": actor_user_id,
            "created_at": now,
            "details": {
                "document_number": number,
                "customer_id": owner["id"],
                "oil_lot_id": draft.oil_lot_id,
                "quantity_kg": Decimal128(draft.quantity_kg),
                "source_tank_id": draft.source_tank_id,
            },
        },
        session=session,
    )
    return await releases.find_one({"id": release_id}, {"_id": 0}, session=session)


def _decimal_quantity(value: Any) -> Decimal:
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value or "0"))


async def get_customer_custody_statement(db: Any, customer_id: str) -> dict[str, Any]:
    """Reconcile a customer's complete custody ledger to live stock balances."""
    owner = await db["commercial_custody_owners"].find_one(
        {"id": customer_id},
        {"_id": 0, "id": 1, "client_phone": 1, "client_name": 1, "active": 1},
    )
    if not owner:
        raise ValueError("Customer custody account does not exist")

    movements = await db["commercial_stock_movements"].find(
        {"$or": [
            {"source_owner.kind": "CUSTOMER", "source_owner.customer_id": customer_id},
            {"destination_owner.kind": "CUSTOMER", "destination_owner.customer_id": customer_id},
        ]},
        {"_id": 0, "id": 1, "document_number": 1, "movement_kind": 1,
         "product_kind": 1, "lot_id": 1, "quantity_kg": 1,
         "source_location_id": 1, "destination_location_id": 1,
         "source_owner": 1, "destination_owner": 1,
         "source_document_type": 1, "source_document_id": 1,
         "reason": 1, "created_at": 1},
    ).sort([("created_at", 1), ("document_number", 1)]).to_list(10000)

    ledger_totals = {"OLIVE": Decimal("0.000"), "OIL": Decimal("0.000")}
    rows = []
    for movement in movements:
        product = movement["product_kind"]
        if product not in ledger_totals:
            raise ValueError("Custody ledger contains an unsupported product kind")
        source = movement.get("source_owner") or {}
        destination = movement.get("destination_owner") or {}
        source_matches = source.get("kind") == "CUSTOMER" and source.get("customer_id") == customer_id
        destination_matches = destination.get("kind") == "CUSTOMER" and destination.get("customer_id") == customer_id
        quantity = _decimal_quantity(movement["quantity_kg"])
        delta = quantity if destination_matches and not source_matches else (
            -quantity if source_matches and not destination_matches else Decimal("0.000")
        )
        ledger_totals[product] += delta
        if ledger_totals[product] < 0:
            raise ValueError("Customer custody ledger has a negative running balance")
        rows.append({
            "id": movement["id"],
            "document_number": movement["document_number"],
            "movement_kind": movement["movement_kind"],
            "product_kind": product,
            "lot_id": movement["lot_id"],
            "quantity_kg": quantity,
            "delta_kg": delta,
            "balance_after_kg": ledger_totals[product],
            "source_location_id": movement.get("source_location_id"),
            "destination_location_id": movement.get("destination_location_id"),
            "source_document_type": movement["source_document_type"],
            "source_document_id": movement["source_document_id"],
            "reason": movement.get("reason"),
            "created_at": movement["created_at"],
        })

    balances = await db["commercial_stock_balances"].find(
        {"owner.kind": "CUSTOMER", "owner.customer_id": customer_id},
        {"_id": 0, "product_kind": 1, "quantity_kg": 1},
    ).to_list(10000)
    current_totals = {"OLIVE": Decimal("0.000"), "OIL": Decimal("0.000")}
    for balance in balances:
        product = balance["product_kind"]
        if product in current_totals:
            current_totals[product] += _decimal_quantity(balance["quantity_kg"])

    for product in ("OLIVE", "OIL"):
        if ledger_totals[product].quantize(Decimal("0.001")) != current_totals[product].quantize(Decimal("0.001")):
            raise ValueError(f"Customer custody {product.lower()} ledger does not reconcile to stock balances")

    return {
        "owner": owner,
        "ledger_totals_kg": ledger_totals,
        "current_balances_kg": current_totals,
        "movement_count": len(rows),
        "movements": rows,
    }
