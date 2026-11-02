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
from typing import Any

from pydantic import BaseModel, Field, field_validator

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from commercial.inventory_bootstrap import (
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
)
from commercial.schemas.quality import QualityAssessmentDraft, QualityReleaseCommand
from commercial.schemas.suppliers import CommercialSupplierDraft
from commercial.schemas.buyers import CommercialBuyerDraft
from commercial.schemas.sales import WholesaleSaleDraft, ApproveWholesaleSaleCommand, SalePaymentDraft
from commercial.schemas.varieties import CommercialVarietyDraft
from commercial.services.production import complete_commercial_production
from commercial.services.purchase_approval import approve_olive_purchase
from commercial.services.purchases import create_olive_purchase_draft
from commercial.services.quality import record_oil_quality_assessment, release_oil_quality_assessment
from commercial.services.stock_ledger import post_stock_movement
from commercial.services.internal_movements import create_internal_movement
from commercial.services.sales import create_wholesale_sale_draft, approve_wholesale_sale, record_sale_payment
from lib.auth import current_user, require_admin
from lib.db import client, db, run_transaction
from lib.season import active_season, season_of, season_prefix, valid_season

router = APIRouter(prefix="/commercial/v1", tags=["commercial"])


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
    required_types = {"ACH", "PROD", "LOT", "MVT", "FAC", "VTE", "PAY"}
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
    required_types = {"ACH", "PROD", "LOT", "MVT", "FAC", "VTE"}
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


@router.get("/locations")
async def list_commercial_locations(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    docs = await db.commercial_locations.find(
        {"active": True}, {"_id": 0}
    ).sort("code", 1).to_list(500)
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


@router.get("/suppliers")
async def list_commercial_suppliers(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    docs = await db.commercial_suppliers.find(
        {"active": True}, {"_id": 0}
    ).sort("name", 1).to_list(1000)
    return _safe(docs)


@router.get("/varieties")
async def list_commercial_varieties(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    docs = await db.commercial_varieties.find(
        {"active": True}, {"_id": 0}
    ).sort("code", 1).to_list(500)
    return _safe(docs)


@router.post("/varieties", status_code=201)
async def create_commercial_variety(
    draft: CommercialVarietyDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_purchases")
    await _require_commercial_ready()
    normalized_name = " ".join(draft.name_fr.casefold().split())
    doc = {
        "id": str(uuid.uuid4()),
        **draft.model_dump(),
        "normalized_name_fr": normalized_name,
        "active": True,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    audit_id = str(uuid.uuid4())

    async def create_variety(session):
        await db.commercial_varieties.insert_one(doc, session=session)
        await db.commercial_audit_events.insert_one({
            "id": audit_id, "entity_type": "commercial_variety",
            "entity_id": doc["id"], "action": "VARIETY_CREATED",
            "actor_user_id": user["id"], "created_at": doc["created_at"],
            "details": {"code": doc["code"], "name_fr": doc["name_fr"]},
        }, session=session)
        return doc

    try:
        return _safe(await run_transaction(create_variety))
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_variety_code_or_name_exists") from exc



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
        "normalized_name": normalized_name, "active": True,
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
async def list_commercial_buyers(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    docs = await db.commercial_buyers.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(1000)
    return _safe(docs)


@router.get("/buyers/{buyer_id}/account-summary")
async def get_commercial_buyer_account_summary(
    buyer_id: str,
    user: dict = Depends(current_user),
):
    """Return a read-only receivables summary across this buyer's commercial invoices."""
    _authorize(user, "commercial.read")
    buyer = await db.commercial_buyers.find_one(
        {"id": buyer_id}, {"_id": 0, "id": 1, "name": 1, "active": 1}
    )
    if not buyer:
        raise HTTPException(404, "commercial_buyer_not_found")

    rows = await db.commercial_sales_invoices.aggregate([
        {"$match": {"buyer_id": buyer_id}},
        {"$group": {
            "_id": None,
            "invoice_count": {"$sum": 1},
            "total_amount_dt": {"$sum": "$total_amount_dt"},
            "paid_amount_dt": {"$sum": "$paid_amount_dt"},
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
        }},
    ]).to_list(length=1)
    summary = rows[0] if rows else {
        "invoice_count": 0,
        "total_amount_dt": Decimal128("0.000"),
        "paid_amount_dt": Decimal128("0.000"),
        "outstanding_amount_dt": Decimal128("0.000"),
        "unpaid_invoice_count": 0,
        "partially_paid_invoice_count": 0,
        "paid_invoice_count": 0,
    }
    summary.pop("_id", None)
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


@router.get("/sales")
async def list_wholesale_sales(
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
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
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_sales_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
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
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_sale_payments.find(
        {"invoice_id": invoice_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
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


@router.get("/olive-purchases")
async def list_olive_purchases(
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_olive_purchases.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
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
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    docs = await db.commercial_production_runs.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
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


@router.get("/quality-assessments")
async def list_quality_assessments(
    lot_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"oil_lot_id": lot_id} if lot_id else {}
    docs = await db.commercial_quality_assessments.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return _safe(docs)


@router.get("/lots")
async def list_commercial_lots(
    product_kind: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"product_kind": product_kind} if product_kind in {"OLIVE", "OIL"} else {}
    docs = await db.commercial_lots.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
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


@router.get("/stock-balances")
async def list_stock_balances(
    product_kind: str | None = None,
    location_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
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
    ).sort("location_id", 1).to_list(limit)
    return _safe(docs)


@router.get("/stock-movements")
async def list_stock_movements(
    lot_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    user: dict = Depends(current_user),
):
    _authorize(user, "commercial.read")
    query = {"lot_id": lot_id} if lot_id else {}
    docs = await db.commercial_stock_movements.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return _safe(docs)


@router.get("/audit-events")
async def list_commercial_audit_events(
    entity_type: str | None = None,
    entity_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
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
    ).sort("created_at", -1).to_list(limit)
    return _safe(docs)
