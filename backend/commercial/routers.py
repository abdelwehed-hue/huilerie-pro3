"""Authenticated API surface for the isolated commercial domain.

Commercial activation is explicit and fails closed unless MongoDB is a replica
set (or sharded cluster) capable of transactions. No legacy pressing endpoint
or collection is modified here.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from commercial.inventory_bootstrap import (
    COMMERCIAL_DOCUMENT_TYPES,
    ensure_inventory_indexes,
    provision_commercial_counters,
    provision_nine_tanks,
)
from commercial.permissions import ASSIGNABLE_COMMERCIAL_PERMISSIONS, effective_commercial_permissions, require_commercial_permission
from commercial.schemas.inventory import CommercialLocationDraft, StockMovementDraft
from commercial.schemas.internal_movements import InternalMovementDraft
from commercial.schemas.production import CommercialProductionDraft
from commercial.schemas.purchases import (
    ApproveOlivePurchaseCommand,
    OlivePurchaseDraft,
    OlivePurchaseUpdate,
)
from commercial.schemas.quality import QualityAssessmentDraft, QualityAssessmentUpdate, QualityReleaseCommand
from commercial.schemas.suppliers import CommercialSupplierDraft, CommercialSupplierUpdate
from commercial.schemas.buyers import (
    CommercialBuyerDraft, CommercialBuyerUpdate, CommercialBuyerStatusCommand,
)
from commercial.schemas.sales import WholesaleSaleDraft, ApproveWholesaleSaleCommand, SalePaymentDraft, CancelWholesaleSaleCommand
from commercial.schemas.returns import SaleReturnDraft
from commercial.schemas.return_acceptance import AcceptSaleReturnCommand
from commercial.schemas.return_rejection import RejectSaleReturnCommand
from commercial.schemas.customer_custody import CustomerOliveCustodyReceiptDraft, CustomerOilCustodyReleaseDraft
from commercial.schemas.credit_application import BuyerCreditApplicationDraft
from commercial.schemas.payment_reversal import PaymentReversalDraft
from commercial.services.production import complete_commercial_production
from commercial.services.purchase_approval import approve_olive_purchase
from commercial.services.purchases import create_olive_purchase_draft, update_olive_purchase_draft
from commercial.services.quality import (\n    record_oil_quality_assessment, release_oil_quality_assessment,\n    update_oil_quality_assessment, delete_oil_quality_assessment,\n)
from commercial.services.stock_ledger import post_stock_movement
from commercial.services.internal_movements import create_internal_movement
from commercial.services.tank_roles import set_tank_role
from commercial.services.sale_returns import receive_wholesale_sale_return
from commercial.services.return_acceptance import accept_sale_return_and_issue_credit_note
from commercial.services.return_rejection import reject_sale_return_and_dispatch_to_buyer
from commercial.services.customer_custody import receive_customer_olive_custody, release_customer_oil_custody, get_customer_custody_statement
from commercial.services.credit_application import apply_buyer_credit_to_invoice
from commercial.services.payment_reversal import reverse_sale_payment
from commercial.services.sales import create_wholesale_sale_draft, approve_wholesale_sale, record_sale_payment, cancel_wholesale_sale_draft
from lib.auth import current_user, require_admin
from lib.db import client, db, run_transaction
from lib.season import DEFAULT_VARIETIES, active_season, season_of, season_prefix, valid_season

router = APIRouter(prefix="/commercial/v1", tags=["commercial"])


class CommercialTankRoleCommand(BaseModel):
    role: Literal["NORMAL", "QUARANTINE"]
    expected_version: int = Field(ge=1)


class CommercialTankCapacityCommand(BaseModel):
    capacity_kg: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=3)
    expected_version: int = Field(ge=1)


class CommercialPermissionAssignment(BaseModel):
    permissions: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("Duplicate commercial permissions are not allowed")
        unknown = set(values) - ASSIGNABLE_COMMERCIAL_PERMISSIONS
        if unknown:
            raise ValueError(f"Unsupported assignable commercial permissions: {sorted(unknown)}")
        return values



def _reject_public_auth_mode() -> None:
    if os.environ.get("AUTH_DISABLED", "false").strip().lower() in {"1", "true", "yes", "on"}:
        raise HTTPException(503, "commercial_requires_cookie_authentication")


def _authorize(user: dict[str, Any], permission: str) -> None:
    _reject_public_auth_mode()
    try:
        require_commercial_permission(user, permission)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc


def _safe(value: Any) -> Any:
    if isinstance(value, Decimal128):
        return str(value.to_decimal())
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _safe(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, (list, tuple)):
        return [_safe(item) for item in value]
    return value


def _raise_domain_error(exc: Exception) -> None:
    if isinstance(exc, PermissionError):
        raise HTTPException(403, str(exc)) from exc
    if isinstance(exc, DuplicateKeyError):
        raise HTTPException(409, "commercial_duplicate_record") from exc
    if isinstance(exc, ValueError):
        message = str(exc)
        status = 409 if any(word in message.lower() for word in (
            "conflict", "already", "concurrently", "insufficient", "version"
        )) else 422
        raise HTTPException(status, message) from exc
    raise exc


async def _active_season_code() -> tuple[str, str]:
    season = await active_season()
    try:
        if not valid_season(season):
            raise ValueError("Invalid active season")
        code = season_prefix(season)
    except (AttributeError, ValueError) as exc:
        raise HTTPException(503, "active_season_configuration_invalid") from exc
    if len(code) != 4 or not code.isdigit():
        raise HTTPException(503, "active_season_configuration_invalid")
    return season, code


async def _require_commercial_ready() -> tuple[str, str]:
    season, season_code = await _active_season_code()
    tanks = await db.commercial_tanks.count_documents({})
    counter_docs = await db.commercial_counters.find({"season_code": season_code}, {"_id": 0, "document_type": 1}).to_list(20)
    required_types = set(COMMERCIAL_DOCUMENT_TYPES)
    counter_types = {item.get("document_type") for item in counter_docs}
    if tanks != 9 or not required_types.issubset(counter_types):
        raise HTTPException(503, "commercial_domain_not_bootstrapped")
    return season, season_code


@router.get("/status")
async def commercial_status(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    season, season_code = await _active_season_code()
    tanks = await db.commercial_tanks.count_documents({})
    locations = await db.commercial_locations.count_documents({"active": True})
    counter_docs = await db.commercial_counters.find({"season_code": season_code}, {"_id": 0, "document_type": 1}).to_list(20)
    required_types = set(COMMERCIAL_DOCUMENT_TYPES)
    counter_types = {item.get("document_type") for item in counter_docs}
    counters = len(required_types.intersection(counter_types))
    return {
        "active_season": season,
        "season_code": season_code,
        "tanks_provisioned": tanks,
        "active_olive_locations": locations,
        "season_counters_provisioned": counters,
        "ready": tanks == 9 and counters == len(required_types),
    }


@router.post("/bootstrap")
async def bootstrap_commercial_domain(user: dict = Depends(require_admin)):
    """Explicit one-time bootstrap; never runs automatically during app startup."""
    _reject_public_auth_mode()
    try:
        hello = await client.admin.command("hello")
    except Exception as exc:
        raise HTTPException(503, "mongodb_topology_check_failed") from exc
    if (not hello.get("setName") and hello.get("msg") != "isdbgrid") or not hello.get("logicalSessionTimeoutMinutes"):
        raise HTTPException(503, "commercial_requires_mongodb_replica_set")
    season, season_code = await _active_season_code()
    try:
        await ensure_inventory_indexes(db)
        tanks = await provision_nine_tanks(db)
        counter_count = await provision_commercial_counters(db, season_code)
    except Exception as exc:
        raise HTTPException(503, "commercial_bootstrap_failed") from exc
    return {
        "active_season": season,
        "season_code": season_code,
        "tanks_provisioned": len(tanks),
        "counters_provisioned": counter_count,
        "transaction_topology": "replica_set" if hello.get("setName") else "sharded_cluster",
    }


@router.get("/me/permissions")
async def get_my_commercial_permissions(user: dict = Depends(current_user)):
    """Return effective commercial permissions for the authenticated user."""
    _reject_public_auth_mode()
    return {"permissions": sorted(effective_commercial_permissions(user))}


@router.get("/tanks")
async def list_commercial_tanks(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    docs = await db.commercial_tanks.find({}, {"_id": 0}).sort("code", 1).to_list(20)
    return _safe(docs)


@router.post("/tanks/{tank_id}/role")
async def update_commercial_tank_role(
    tank_id: str,
    command: CommercialTankRoleCommand,
    user: dict = Depends(require_admin),
):
    """Assign NORMAL/QUARANTINE role only to an empty tank; every change is audited."""
    _authorize(user, "commercial.manage_tanks")
    await _require_commercial_ready()
    audit_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: set_tank_role(
                db, tank_id, role=command.role,
                expected_version=command.expected_version,
                actor_user=user, actor_user_id=user["id"],
                audit_event_id=audit_id, changed_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.put("/tanks/{tank_id}/capacity")
async def update_commercial_tank_capacity(
    tank_id: str,
    command: CommercialTankCapacityCommand,
    user: dict = Depends(require_admin),
):
    """Set a tank's maximum oil capacity; null keeps it flexible."""
    _authorize(user, "commercial.manage_tanks")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    audit_id = str(uuid.uuid4())

    async def operation(session):
        tanks = db["commercial_tanks"]
        tank = await tanks.find_one({"id": tank_id, "active": True}, {"_id": 0}, session=session)
        if not tank:
            raise ValueError("Unknown or inactive commercial tank")
        version = int(tank.get("version", 1))
        if version != command.expected_version:
            raise ValueError("Tank version conflict; reload before changing its capacity")
        current = await db["commercial_stock_balances"].aggregate([
            {"$match": {"location_id": tank_id, "product_kind": "OIL"}},
            {"$group": {"_id": None, "quantity": {"$sum": "$quantity_kg"}}},
        ], session=session).to_list(1)
        current_quantity = Decimal(str(current[0]["quantity"].to_decimal() if hasattr(current[0]["quantity"], "to_decimal") else current[0]["quantity"])) if current else Decimal("0")
        if command.capacity_kg is not None and command.capacity_kg < current_quantity:
            raise ValueError("Tank capacity cannot be lower than its current oil stock")
        updated = await tanks.update_one(
            {"id": tank_id, "active": True, "version": version},
            {"$set": {
                "capacity_kg": Decimal128(command.capacity_kg) if command.capacity_kg is not None else None,
                "updated_at": now, "updated_by": user["id"],
            }, "$inc": {"version": 1}},
            session=session,
        )
        if updated.matched_count != 1:
            raise ValueError("Tank version conflict; reload before changing its capacity")
        await db["commercial_audit_events"].insert_one({
            "id": audit_id, "entity_type": "commercial_tank",
            "entity_id": tank_id, "action": "TANK_CAPACITY_CHANGED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {
                "previous_capacity_kg": tank.get("capacity_kg"),
                "capacity_kg": Decimal128(command.capacity_kg) if command.capacity_kg is not None else None,
                "current_stock_kg": Decimal128(current_quantity),
                "version": version + 1,
            },
        }, session=session)
        return await tanks.find_one({"id": tank_id}, {"_id": 0}, session=session)

    try:
        return _safe(await run_transaction(operation))
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/locations")
async def list_commercial_locations(
    limit: int = Query(default=500, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_locations.find(
        {"active": True}, {"_id": 0}
    ).sort([("code", 1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/locations", status_code=201)
async def create_commercial_location(
    draft: CommercialLocationDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_tanks")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        **draft.model_dump(),
        "active": True,
        "created_by": user["id"],
        "created_at": now,
    }
    audit_id = str(uuid.uuid4())

    async def create_location(session):
        await db.commercial_locations.insert_one(doc, session=session)
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_location",
            "entity_id": doc["id"], "action": "LOCATION_CREATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {"code": doc["code"], "kind": doc["kind"]},
        }, session=session)
        return doc

    try:
        return _safe(await run_transaction(create_location))
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_location_code_exists") from exc


@router.post("/suppliers", status_code=201)
async def create_commercial_supplier(
    draft: CommercialSupplierDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_purchases")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    normalized_name = " ".join(draft.name.casefold().split())
    existing = await db.commercial_suppliers.find_one(
        {"normalized_name": normalized_name}, {"_id": 1}
    )
    if existing:
        raise HTTPException(409, "commercial_supplier_name_exists")
    doc = {
        "id": str(uuid.uuid4()),
        **draft.model_dump(),
        "normalized_name": normalized_name,
        "active": True,
        "created_by": user["id"],
        "created_at": now,
    }
    audit_id = str(uuid.uuid4())

    async def create_supplier(session):
        await db.commercial_suppliers.insert_one(doc, session=session)
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_supplier",
            "entity_id": doc["id"], "action": "SUPPLIER_CREATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {"name": doc["name"]},
        }, session=session)
        return doc

    try:
        return _safe(await run_transaction(create_supplier))
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_supplier_name_exists") from exc


@router.put("/suppliers/{supplier_id}")
async def update_commercial_supplier(
    supplier_id: str,
    draft: CommercialSupplierUpdate,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_purchases")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    normalized_name = " ".join(draft.name.casefold().split())
    fields = draft.model_dump(exclude={"expected_version"})
    audit_id = str(uuid.uuid4())

    async def update_supplier(session):
        existing = await db.commercial_suppliers.find_one(
            {"id": supplier_id}, {"_id": 0}, session=session
        )
        if not existing:
            raise HTTPException(404, "commercial_supplier_not_found")
        current_version = int(existing.get("version", 1))
        if current_version != draft.expected_version:
            raise HTTPException(409, "commercial_supplier_version_conflict")
        duplicate = await db.commercial_suppliers.find_one(
            {"normalized_name": normalized_name, "id": {"$ne": supplier_id}},
            {"_id": 1}, session=session,
        )
        if duplicate:
            raise HTTPException(409, "commercial_supplier_name_exists")
        version_filter = {"version": draft.expected_version}
        if draft.expected_version == 1 and "version" not in existing:
            version_filter = {"version": {"$exists": False}}
        result = await db.commercial_suppliers.update_one(
            {"id": supplier_id, **version_filter},
            {"$set": {
                **fields, "normalized_name": normalized_name,
                "updated_at": now, "updated_by": user["id"],
            }, "$inc": {"version": 1}},
            session=session,
        )
        if result.matched_count != 1:
            raise HTTPException(409, "commercial_supplier_version_conflict")
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_supplier",
            "entity_id": supplier_id, "action": "SUPPLIER_UPDATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {
                "changed_fields": sorted(fields.keys()),
                "previous_name": existing.get("name"),
                "new_name": draft.name,
                "version": current_version + 1,
            },
        }, session=session)
        return await db.commercial_suppliers.find_one(
            {"id": supplier_id}, {"_id": 0}, session=session
        )

    try:
        return _safe(await run_transaction(update_supplier))
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_supplier_name_exists") from exc


@router.delete("/suppliers/{supplier_id}")
async def deactivate_commercial_supplier(
    supplier_id: str,
    user: dict = Depends(require_admin),
):
    """Soft-delete a supplier; historical purchases retain their supplier reference."""
    _authorize(user, "commercial.manage_purchases")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    audit_id = str(uuid.uuid4())

    async def deactivate_supplier(session):
        existing = await db.commercial_suppliers.find_one(
            {"id": supplier_id}, {"_id": 0}, session=session
        )
        if not existing:
            raise HTTPException(404, "commercial_supplier_not_found")
        if existing.get("active") is not True:
            raise HTTPException(409, "commercial_supplier_already_inactive")
        version = int(existing.get("version", 1))
        version_filter = {"version": version}
        if version == 1 and "version" not in existing:
            version_filter = {"version": {"$exists": False}}
        result = await db.commercial_suppliers.update_one(
            {"id": supplier_id, "active": True, **version_filter},
            {"$set": {
                "active": False,
                "deactivated_at": now,
                "deactivated_by": user["id"],
                "updated_at": now,
            }, "$inc": {"version": 1}},
            session=session,
        )
        if result.matched_count != 1:
            raise HTTPException(409, "commercial_supplier_version_conflict")
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_supplier",
            "entity_id": supplier_id, "action": "SUPPLIER_DEACTIVATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {"name": existing.get("name"), "preserved_history": True},
        }, session=session)
        return {"id": supplier_id, "active": False}

    return await run_transaction(deactivate_supplier)


@router.get("/suppliers")
async def list_commercial_suppliers(
    limit: int = Query(default=500, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_suppliers.find(
        {"active": True}, {"_id": 0}
    ).sort([("name", 1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/varieties")
async def list_commercial_varieties(
    limit: int = Query(default=500, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    """Use Paramètres > Tarif as the sole active olive-variety master list.

    Retired commercial variety records remain available as inactive references
    so historical documents can still be interpreted.
    """
    _authorize(user, "commercial.read")
    settings_doc = await db.settings.find_one(
        {"key": "app"}, {"_id": 0, "varieties": 1}
    ) or {}
    configured = settings_doc.get("varieties") or DEFAULT_VARIETIES
    active_names = list(dict.fromkeys(
        str(name).strip() for name in configured
        if isinstance(name, str) and str(name).strip()
    ))
    active_ids = set(active_names)
    docs = [
        {"id": name, "code": "", "name_fr": name, "name_ar": None, "active": True}
        for name in active_names
    ]
    legacy = await db.commercial_varieties.find(
        {}, {"_id": 0}
    ).sort([("code", 1), ("id", 1)]).to_list(1000)
    docs.extend({**item, "active": False} for item in legacy if item.get("id") not in active_ids)
    return _safe(docs[skip:skip + limit])


@router.post("/buyers", status_code=201)
async def create_commercial_buyer(
    draft: CommercialBuyerDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    await _require_commercial_ready()
    normalized_name = " ".join(draft.name.casefold().split())
    doc = {
        "id": str(uuid.uuid4()), **draft.model_dump(),
        "normalized_name": normalized_name, "active": True, "version": 1,
        "created_by": user["id"], "created_at": datetime.now(timezone.utc),
    }
    audit_id = str(uuid.uuid4())

    async def create_buyer(session):
        await db.commercial_buyers.insert_one(doc, session=session)
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_buyer",
            "entity_id": doc["id"], "action": "BUYER_CREATED",
            "actor_user_id": user["id"], "created_at": doc["created_at"],
            "details": {"name": doc["name"]},
        }, session=session)
        return doc

    try:
        return _safe(await run_transaction(create_buyer))
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_buyer_name_exists") from exc


@router.get("/buyers")
async def list_commercial_buyers(
    limit: int = Query(default=500, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    # Keep inactive buyers visible for historical invoices and account follow-up.
    docs = await db.commercial_buyers.find({}, {"_id": 0}).sort([("name", 1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.put("/buyers/{buyer_id}")
async def update_commercial_buyer(
    buyer_id: str,
    draft: CommercialBuyerUpdate,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    normalized_name = " ".join(draft.name.casefold().split())
    fields = draft.model_dump(exclude={"expected_version"})
    audit_id = str(uuid.uuid4())

    async def update_buyer(session):
        existing = await db.commercial_buyers.find_one(
            {"id": buyer_id}, {"_id": 0}, session=session
        )
        if not existing:
            raise HTTPException(404, "commercial_buyer_not_found")
        current_version = int(existing.get("version", 1))
        if current_version != draft.expected_version:
            raise HTTPException(409, "commercial_buyer_version_conflict")
        version_filter = {"version": draft.expected_version}
        if draft.expected_version == 1 and "version" not in existing:
            version_filter = {"version": {"$exists": False}}
        update = await db.commercial_buyers.update_one(
            {"id": buyer_id, **version_filter},
            {"$set": {
                **fields, "normalized_name": normalized_name,
                "updated_at": now, "updated_by": user["id"],
            }, "$inc": {"version": 1}},
            session=session,
        )
        if update.matched_count != 1:
            raise HTTPException(409, "commercial_buyer_version_conflict")
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_buyer",
            "entity_id": buyer_id, "action": "BUYER_UPDATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {
                "changed_fields": sorted(fields.keys()),
                "previous_name": existing.get("name"),
                "new_name": draft.name,
                "version": current_version + 1,
            },
        }, session=session)
        return await db.commercial_buyers.find_one(
            {"id": buyer_id}, {"_id": 0}, session=session
        )

    try:
        return _safe(await run_transaction(update_buyer))
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_buyer_name_exists") from exc


@router.post("/buyers/{buyer_id}/status")
async def set_commercial_buyer_status(
    buyer_id: str,
    command: CommercialBuyerStatusCommand,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    audit_id = str(uuid.uuid4())

    async def change_status(session):
        existing = await db.commercial_buyers.find_one(
            {"id": buyer_id}, {"_id": 0}, session=session
        )
        if not existing:
            raise HTTPException(404, "commercial_buyer_not_found")
        current_version = int(existing.get("version", 1))
        if existing.get("active", True) == command.active:
            return existing
        if current_version != command.expected_version:
            raise HTTPException(409, "commercial_buyer_version_conflict")
        version_filter = {"version": command.expected_version}
        if command.expected_version == 1 and "version" not in existing:
            version_filter = {"version": {"$exists": False}}
        update = await db.commercial_buyers.update_one(
            {"id": buyer_id, **version_filter},
            {"$set": {
                "active": command.active, "updated_at": now,
                "updated_by": user["id"],
            }, "$inc": {"version": 1}},
            session=session,
        )
        if update.matched_count != 1:
            raise HTTPException(409, "commercial_buyer_version_conflict")
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_buyer",
            "entity_id": buyer_id,
            "action": "BUYER_REACTIVATED" if command.active else "BUYER_DEACTIVATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {
                "previous_active": existing.get("active", True),
                "active": command.active, "version": current_version + 1,
            },
        }, session=session)
        return await db.commercial_buyers.find_one(
            {"id": buyer_id}, {"_id": 0}, session=session
        )

    return _safe(await run_transaction(change_status))


@router.get("/buyers/{buyer_id}/account-summary")
async def get_commercial_buyer_account_summary(
    buyer_id: str,
    user: dict = Depends(current_user),
):
    """Return a read-only receivables summary across this buyer's commercial invoices."""
    _authorize(user, "commercial.read")
    buyer = await db.commercial_buyers.find_one(
        {"id": buyer_id}, {"_id": 0, "id": 1, "name": 1, "active": 1,
                           "credit_balance_dt": 1}
    )
    if not buyer:
        raise HTTPException(404, "commercial_buyer_not_found")

    rows = await db.commercial_sales_invoices.aggregate([
        {"$match": {"buyer_id": buyer_id}},
        {"$group": {
            "_id": None,
            "invoice_count": {"$sum": 1},
            "gross_invoiced_amount_dt": {"$sum": "$total_amount_dt"},
            "total_amount_dt": {"$sum": {"$ifNull": ["$net_amount_dt", "$total_amount_dt"]}},
            "credited_amount_dt": {"$sum": {"$ifNull": ["$credited_amount_dt", Decimal128("0.000")]}},
            "paid_amount_dt": {"$sum": "$paid_amount_dt"},
            "applied_credit_amount_dt": {"$sum": {"$ifNull": ["$applied_credit_amount_dt", Decimal128("0.000")]}},
            "settled_amount_dt": {"$sum": {"$add": [
                {"$ifNull": ["$paid_amount_dt", Decimal128("0.000")]},
                {"$ifNull": ["$applied_credit_amount_dt", Decimal128("0.000")]}
            ]}},
            "outstanding_amount_dt": {"$sum": "$outstanding_amount_dt"},
            "unpaid_invoice_count": {
                "$sum": {"$cond": [{"$eq": ["$payment_status", "UNPAID"]}, 1, 0]}
            },
            "partially_paid_invoice_count": {
                "$sum": {"$cond": [{"$eq": ["$payment_status", "PARTIALLY_PAID"]}, 1, 0]}
            },
            "paid_invoice_count": {
                "$sum": {"$cond": [{"$eq": ["$payment_status", "PAID"]}, 1, 0]}
            },
            "credited_invoice_count": {
                "$sum": {"$cond": [{"$eq": ["$payment_status", "CREDITED"]}, 1, 0]}
            },
            "credit_applied_invoice_count": {
                "$sum": {"$cond": [
                    {"$gt": [{"$ifNull": ["$applied_credit_amount_dt", Decimal128("0.000")]}, Decimal128("0.000")]},
                    1, 0
                ]}
            },
        }},
    ]).to_list(length=1)
    summary = rows[0] if rows else {
        "invoice_count": 0,
        "gross_invoiced_amount_dt": Decimal128("0.000"),
        "total_amount_dt": Decimal128("0.000"),
        "credited_amount_dt": Decimal128("0.000"),
        "paid_amount_dt": Decimal128("0.000"),
        "applied_credit_amount_dt": Decimal128("0.000"),
        "settled_amount_dt": Decimal128("0.000"),
        "outstanding_amount_dt": Decimal128("0.000"),
        "unpaid_invoice_count": 0,
        "partially_paid_invoice_count": 0,
        "paid_invoice_count": 0,
        "credited_invoice_count": 0,
        "credit_applied_invoice_count": 0,
    }
    summary.pop("_id", None)
    summary["buyer_credit_balance_dt"] = buyer.get("credit_balance_dt", Decimal128("0.000"))
    return _safe({"buyer": buyer, "summary": summary})


@router.post("/sales", status_code=201)
async def create_wholesale_sale(
    draft: WholesaleSaleDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    season, season_code = await _require_commercial_ready()
    if season_of(draft.sale_date.isoformat()) != season:
        raise HTTPException(422, "sale_date_outside_active_season")
    sale_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: create_wholesale_sale_draft(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], sale_id=sale_id,
                audit_event_id=audit_id, created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.post("/sales/{sale_id}/cancel")
async def cancel_wholesale_sale_route(
    sale_id: str,
    command: CancelWholesaleSaleCommand,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    audit_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: cancel_wholesale_sale_draft(
                db, sale_id, command, actor_user=user, actor_user_id=user["id"],
                audit_event_id=audit_id, created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.post("/sales/{sale_id}/returns", status_code=201)
async def receive_sale_return(
    sale_id: str,
    draft: SaleReturnDraft,
    user: dict = Depends(require_admin),
):
    """Receive an approved sale return into quarantine; no credit note is issued here."""
    _authorize(user, "commercial.manage_sales")
    _, season_code = await _require_commercial_ready()
    return_id, returned_lot_id, movement_id, audit_id = (
        str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    )
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: receive_wholesale_sale_return(
                db, sale_id, draft, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                return_id=return_id, returned_lot_id=returned_lot_id,
                stock_movement_id=movement_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/sale-returns")
async def list_sale_returns(
    sale_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"sale_id": sale_id} if sale_id else {}
    docs = await db.commercial_sale_returns.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/sale-returns/{return_id}/accept", status_code=201)
async def accept_sale_return(
    return_id: str,
    command: AcceptSaleReturnCommand,
    user: dict = Depends(require_admin),
):
    """Accept a physical return commercially and issue an AVO credit note."""
    _authorize(user, "commercial.manage_sales")
    _, season_code = await _require_commercial_ready()
    credit_note_id, buyer_entry_id, audit_id = (
        str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    )
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: accept_sale_return_and_issue_credit_note(
                db, return_id, command, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                credit_note_id=credit_note_id,
                buyer_credit_entry_id=buyer_entry_id,
                audit_event_id=audit_id, decided_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.post("/sale-returns/{return_id}/reject", status_code=201)
async def reject_sale_return(
    return_id: str,
    command: RejectSaleReturnCommand,
    user: dict = Depends(require_admin),
):
    """Reject a received return and dispatch the quarantined lot back to the buyer."""
    _authorize(user, "commercial.manage_sales")
    _authorize(user, "commercial.post_stock")
    season, season_code = await _require_commercial_ready()
    if season_of(command.rejection_date.isoformat()) != season:
        raise HTTPException(422, "return_rejection_date_outside_active_season")
    rejection_id, movement_id, audit_id = (
        str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    )
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: reject_sale_return_and_dispatch_to_buyer(
                db, return_id, command, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                rejection_id=rejection_id, movement_id=movement_id,
                audit_event_id=audit_id, decided_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/sale-return-rejections")
async def list_sale_return_rejections(
    return_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"return_id": return_id} if return_id else {}
    docs = await db.commercial_sale_return_rejections.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/credit-notes")
async def list_commercial_credit_notes(
    return_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"return_id": return_id} if return_id else {}
    docs = await db.commercial_credit_notes.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/sales")
async def list_wholesale_sales(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_sales.find({}, {"_id": 0}).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/sales/{sale_id}/approve")
async def approve_wholesale_sale_route(
    sale_id: str,
    command: ApproveWholesaleSaleCommand,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    _, season_code = await _require_commercial_ready()
    invoice_id, movement_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: approve_wholesale_sale(
                db, sale_id, command, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                invoice_id=invoice_id, stock_movement_id=movement_id,
                audit_event_id=audit_id, created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/sales-invoices")
async def list_commercial_sales_invoices(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_sales_invoices.find({}, {"_id": 0}).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/sale-payments/{payment_id}/reversals", status_code=201)
async def reverse_wholesale_sale_payment(
    payment_id: str,
    draft: PaymentReversalDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    season, season_code = await _require_commercial_ready()
    if season_of(draft.reversal_date.isoformat()) != season:
        raise HTTPException(422, "payment_reversal_date_outside_active_season")
    reversal_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: reverse_sale_payment(
                db, payment_id, draft, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                reversal_id=reversal_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/sales-invoices/{invoice_id}/payment-reversals")
async def list_invoice_payment_reversals(
    invoice_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_payment_reversals.find(
        {"invoice_id": invoice_id},
        {"_id": 0, "id": 1, "document_number": 1, "payment_id": 1,
         "original_payment_number": 1, "amount_dt": 1, "reason": 1,
         "status": 1, "remaining_reversible_dt": 1, "created_at": 1},
    ).sort([("created_at", -1), ("id", -1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/sales-invoices/{invoice_id}/credit-applications", status_code=201)
async def apply_buyer_credit(
    invoice_id: str,
    draft: BuyerCreditApplicationDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    _, season_code = await _require_commercial_ready()
    application_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: apply_buyer_credit_to_invoice(
                db, invoice_id, draft, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                application_id=application_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/sales-invoices/{invoice_id}/credit-applications")
async def list_buyer_credit_applications(
    invoice_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_buyer_credit_applications.find(
        {"target_invoice_id": invoice_id},
        {"_id": 0, "id": 1, "document_number": 1, "amount_dt": 1,
         "source_allocations": 1, "reason": 1, "status": 1, "created_at": 1},
    ).sort([("created_at", -1), ("id", -1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/sales-invoices/{invoice_id}/payments", status_code=201)
async def create_sale_payment(
    invoice_id: str,
    draft: SalePaymentDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_sales")
    _, season_code = await _require_commercial_ready()
    payment_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: record_sale_payment(
                db, invoice_id, draft, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                payment_id=payment_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/sales-invoices/{invoice_id}/payments")
async def list_sale_payments(
    invoice_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_sale_payments.find(
        {"invoice_id": invoice_id}, {"_id": 0}
    ).sort([("created_at", -1), ("id", -1)]).skip(skip).to_list(limit)
    payment_ids = [doc["id"] for doc in docs]
    reversal_totals = {}
    if payment_ids:
        totals = await db.commercial_payment_reversals.aggregate([
            {"$match": {"payment_id": {"$in": payment_ids}}},
            {"$group": {"_id": "$payment_id", "total": {"$sum": "$amount_dt"}}},
        ]).to_list(None)
        reversal_totals = {
            item["_id"]: item["total"].to_decimal() if hasattr(item["total"], "to_decimal") else Decimal(str(item["total"]))
            for item in totals
        }
    for doc in docs:
        reversed_amount = reversal_totals.get(doc["id"], Decimal("0.000"))
        original_amount = doc["amount_dt"].to_decimal() if hasattr(doc["amount_dt"], "to_decimal") else Decimal(str(doc["amount_dt"]))
        doc["reversed_amount_dt"] = Decimal128(reversed_amount)
        doc["remaining_reversible_dt"] = Decimal128(max(Decimal("0.000"), original_amount - reversed_amount))
    return _safe(docs)


@router.post("/olive-purchases", status_code=201)
async def create_olive_purchase(
    draft: OlivePurchaseDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_purchases")
    season, season_code = await _require_commercial_ready()
    if season_of(draft.purchase_date.isoformat()) != season:
        raise HTTPException(422, "purchase_date_outside_active_season")
    purchase_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: create_olive_purchase_draft(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], purchase_id=purchase_id,
                audit_event_id=audit_id, created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.put("/olive-purchases/{purchase_id}")
async def update_olive_purchase(
    purchase_id: str,
    draft: OlivePurchaseUpdate,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_purchases")
    season, _ = await _require_commercial_ready()
    if season_of(draft.purchase_date.isoformat()) != season:
        raise HTTPException(422, "purchase_date_outside_active_season")
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: update_olive_purchase_draft(
                db, purchase_id, draft, actor_user=user,
                actor_user_id=user["id"], audit_event_id=str(uuid.uuid4()),
                updated_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/olive-purchases")
async def list_olive_purchases(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_olive_purchases.find(
        {}, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/olive-purchases/{purchase_id}/approve")
async def approve_purchase(
    purchase_id: str,
    command: ApproveOlivePurchaseCommand,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_purchases")
    await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: approve_olive_purchase(
                db, purchase_id, command, actor_user=user,
                actor_user_id=user["id"], created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.post("/production-runs", status_code=201)
async def create_production_run(
    draft: CommercialProductionDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_production")
    season, season_code = await _require_commercial_ready()
    if season_of(draft.production_date.isoformat()) != season:
        raise HTTPException(422, "production_date_outside_active_season")
    production_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: complete_commercial_production(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], production_id=production_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/production-runs")
async def list_production_runs(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_production_runs.find(
        {}, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/users/{target_user_id}/commercial-permissions")
async def get_commercial_permissions(
    target_user_id: str,
    user: dict = Depends(require_admin),
):
    _reject_public_auth_mode()
    target = await db.users.find_one(
        {"id": target_user_id}, {"_id": 0, "id": 1, "role": 1, "commercial_permissions": 1}
    )
    if not target:
        raise HTTPException(404, "user_not_found")
    return {
        "user_id": target_user_id,
        "role": target.get("role"),
        "permissions": sorted(set(target.get("commercial_permissions", []))),
    }


@router.post("/users/{target_user_id}/commercial-permissions")
async def assign_commercial_permissions(
    target_user_id: str,
    assignment: CommercialPermissionAssignment,
    user: dict = Depends(require_admin),
):
    """Admin-only assignment of narrowly scoped commercial duties to workers."""
    _reject_public_auth_mode()
    target = await db.users.find_one({"id": target_user_id}, {"_id": 0, "id": 1, "role": 1})
    if not target:
        raise HTTPException(404, "user_not_found")
    if target.get("role") != "worker":
        raise HTTPException(422, "commercial_permissions_are_assigned_only_to_worker_accounts")
    await _require_commercial_ready()
    permissions = sorted(set(assignment.permissions))
    now = datetime.now(timezone.utc)
    audit_id = str(uuid.uuid4())

    async def apply_assignment(session):
        updated = await db.users.update_one(
            {"id": target_user_id, "role": "worker"},
            {"$set": {"commercial_permissions": permissions,
                      "commercial_permissions_updated_by": user["id"],
                      "commercial_permissions_updated_at": now}},
            session=session,
        )
        if updated.matched_count != 1:
            raise ValueError("Target account changed; reload before assigning permissions")
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "user",
            "entity_id": target_user_id, "action": "COMMERCIAL_PERMISSIONS_UPDATED",
            "actor_user_id": user["id"], "created_at": now,
            "details": {"permissions": permissions},
        }, session=session)
        return {"user_id": target_user_id, "permissions": permissions}

    return await run_transaction(apply_assignment)


@router.post("/quality-assessments", status_code=201)
async def create_quality_assessment(
    draft: QualityAssessmentDraft,
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.lab_record")
    _, season_code = await _require_commercial_ready()
    assessment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: record_oil_quality_assessment(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], assessment_id=assessment_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.post("/quality-assessments/release", status_code=201)
async def release_quality_assessment(
    command: QualityReleaseCommand,
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.quality_release")
    _, season_code = await _require_commercial_ready()
    release_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: release_oil_quality_assessment(
                db, command, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], release_id=release_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)




@router.put("/quality-assessments/{assessment_id}")
async def update_quality_assessment(
    assessment_id: str,
    draft: QualityAssessmentUpdate,
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.lab_record")
    _, season_code = await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: update_oil_quality_assessment(
                db, assessment_id, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], updated_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.delete("/quality-assessments/{assessment_id}")
async def delete_quality_assessment(
    assessment_id: str,
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.lab_record")
    _, season_code = await _require_commercial_ready()
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: delete_oil_quality_assessment(
                db, assessment_id, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], deleted_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)

@router.get("/quality-assessments")
async def list_quality_assessments(
    lot_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"oil_lot_id": lot_id} if lot_id else {}
    docs = await db.commercial_quality_assessments.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/lots")
async def list_commercial_lots(
    product_kind: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"product_kind": product_kind} if product_kind in {"OLIVE", "OIL"} else {}
    docs = await db.commercial_lots.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/stock-movements", status_code=201)
async def create_stock_movement(
    draft: StockMovementDraft,
    user: dict = Depends(current_user),
):
    """Reject direct ledger writes; movements must originate in their domain workflow."""
    _authorize(user, "commercial.post_stock")
    raise HTTPException(
        422,
        "stock_movements_must_be_posted_by_the_owning_purchase_production_internal_or_sales_workflow",
    )


@router.get("/internal-movements")
async def list_internal_stock_movements(
    limit: int = Query(default=200, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    """List season-numbered internal transfer and ownership-change documents."""
    _authorize(user, "commercial.read")
    docs = await db.commercial_internal_movements.find(
        {}, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/internal-movements", status_code=201)
async def create_internal_stock_movement(
    draft: InternalMovementDraft,
    user: dict = Depends(current_user),
):
    """Create an internal transfer/ownership-change document and ledger posting atomically."""
    _authorize(user, "commercial.post_stock")
    _, season_code = await _require_commercial_ready()
    document_id, stock_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: create_internal_movement(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], movement_document_id=document_id,
                stock_movement_id=stock_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.post("/customer-custody/receipts", status_code=201)
async def receive_customer_custody_olives(
    draft: CustomerOliveCustodyReceiptDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_custody")
    season, season_code = await _require_commercial_ready()
    if season_of(draft.receipt_date.isoformat()) != season:
        raise HTTPException(422, "custody_receipt_date_outside_active_season")
    receipt_id, owner_id, lot_id, movement_id, audit_id = (
        str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4()),
        str(uuid.uuid4()), str(uuid.uuid4())
    )
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: receive_customer_olive_custody(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], receipt_id=receipt_id,
                custody_owner_id=owner_id, olive_lot_id=lot_id,
                stock_movement_id=movement_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/customer-custody/receipts")
async def list_customer_custody_receipts(
    customer_id: str | None = None,
    customer_phone: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"customer_id": customer_id} if customer_id else ({"customer_phone": customer_phone} if customer_phone else {})
    docs = await db.commercial_customer_custody_receipts.find(
        query, {"_id": 0, "id": 1, "document_number": 1, "customer_id": 1, "customer_phone": 1, "customer_name": 1, "olive_lot_id": 1, "variety_id": 1, "quantity_kg": 1, "receiving_location_id": 1, "receipt_date": 1, "customer_acknowledgement_reference": 1, "source_reference": 1, "status": 1, "created_at": 1}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.post("/customer-custody/releases", status_code=201)
async def release_customer_custody_oil(
    draft: CustomerOilCustodyReleaseDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_custody")
    season, season_code = await _require_commercial_ready()
    if season_of(draft.release_date.isoformat()) != season:
        raise HTTPException(422, "custody_release_date_outside_active_season")
    release_id, movement_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: release_customer_oil_custody(
                db, draft, season_code=season_code, actor_user=user,
                actor_user_id=user["id"], release_id=release_id,
                stock_movement_id=movement_id, audit_event_id=audit_id,
                created_at=now, session=session,
            )
        )
        return _safe(result)
    except Exception as exc:
        _raise_domain_error(exc)


@router.get("/customer-custody/releases")
async def list_customer_custody_releases(
    customer_id: str | None = None,
    customer_phone: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"customer_id": customer_id} if customer_id else ({"customer_phone": customer_phone} if customer_phone else {})
    docs = await db.commercial_customer_custody_releases.find(
        query, {"_id": 0, "id": 1, "document_number": 1, "customer_id": 1, "customer_phone": 1, "customer_name": 1, "oil_lot_id": 1, "source_tank_id": 1, "quantity_kg": 1, "release_date": 1, "customer_acknowledgement_reference": 1, "reason": 1, "status": 1, "created_at": 1}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/customer-custody/owners/{customer_id}/statement")
async def get_customer_custody_statement_route(
    customer_id: str,
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    try:
        return _safe(await get_customer_custody_statement(db, customer_id))
    except ValueError as exc:
        if "does not exist" in str(exc).lower():
            raise HTTPException(404, "customer_custody_owner_not_found") from exc
        raise HTTPException(409, str(exc)) from exc


@router.get("/customer-custody/owners")
async def list_customer_custody_owners(
    limit: int = Query(default=500, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_custody_owners.find(
        {}, {"_id": 0, "id": 1, "client_phone": 1, "client_name": 1, "active": 1, "version": 1}
    ).sort([("client_name", 1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/stock-balances")
async def list_stock_balances(
    product_kind: str | None = None,
    location_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query: dict[str, Any] = {}
    if product_kind in {"OLIVE", "OIL"}:
        query["product_kind"] = product_kind
    if location_id:
        query["location_id"] = location_id
    docs = await db.commercial_stock_balances.find(
        query, {"_id": 0}
    ).sort([("product_kind", 1), ("lot_id", 1), ("owner.kind", 1), ("owner.customer_id", 1), ("location_id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/stock-movements")
async def list_stock_movements(
    lot_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"lot_id": lot_id} if lot_id else {}
    docs = await db.commercial_stock_movements.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)


@router.get("/audit-events")
async def list_commercial_audit_events(
    entity_type: str | None = None,
    entity_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.view_audit")
    query: dict[str, Any] = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    docs = await db.commercial_audit_events.find(
        query, {"_id": 0}
    ).sort([("created_at", -1), ("id", 1)]).skip(skip).to_list(limit)
    return _safe(docs)
