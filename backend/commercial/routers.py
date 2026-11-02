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

from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from commercial.inventory_bootstrap import (
    ensure_inventory_indexes,
    provision_commercial_counters,
    provision_nine_tanks,
)
from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import CommercialLocationDraft, StockMovementDraft
from commercial.schemas.production import CommercialProductionDraft
from commercial.schemas.purchases import (
    ApproveOlivePurchaseCommand,
    OlivePurchaseDraft,
)
from commercial.schemas.quality import QualityAssessmentDraft
from commercial.schemas.suppliers import CommercialSupplierDraft
from commercial.services.production import complete_commercial_production
from commercial.services.purchase_approval import approve_olive_purchase
from commercial.services.purchases import create_olive_purchase_draft
from commercial.services.quality import record_oil_quality_assessment
from commercial.services.stock_ledger import post_stock_movement
from lib.auth import current_user, require_admin
from lib.db import client, db, run_transaction
from lib.season import active_season, season_of, season_prefix, valid_season

router = APIRouter(prefix="/commercial/v1", tags=["commercial"])


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
    required_types = {"ACH", "PROD", "LOT", "MVT", "FAC", "VTE"}
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
    try:
        await db.commercial_locations.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_location_code_exists") from exc
    return _safe(doc)


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
    try:
        await db.commercial_suppliers.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(409, "commercial_supplier_name_exists") from exc
    return _safe(doc)


@router.get("/suppliers")
async def list_commercial_suppliers(user: dict = Depends(current_user)):
    _authorize(user, "commercial.read")
    docs = await db.commercial_suppliers.find(
        {"active": True}, {"_id": 0}
    ).sort("name", 1).to_list(1000)
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


@router.post("/quality-assessments", status_code=201)
async def create_quality_assessment(
    draft: QualityAssessmentDraft,
    user: dict = Depends(require_admin),
):
    _authorize(user, "commercial.manage_quality")
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
    """Post a validated stock movement atomically; never accept client balances."""
    _authorize(user, "commercial.post_stock")
    _, season_code = await _require_commercial_ready()
    movement_id, audit_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        result = await run_transaction(
            lambda session: post_stock_movement(
                db, draft, season_code=season_code,
                actor_user=user, actor_user_id=user["id"],
                movement_id=movement_id, audit_event_id=audit_id,
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
