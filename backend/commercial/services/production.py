"""Atomic commercial olive-to-oil production posting.

The caller MUST execute this service inside the existing run_transaction
callback. A production run, all olive consumption movements, the output oil
lot, the tank receipt, and audit records commit or roll back together.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson.decimal128 import Decimal128

from commercial.permissions import require_commercial_permission
from commercial.schemas.inventory import OwnerRef, StockMovementDraft
from commercial.schemas.production import CommercialProductionDraft
from commercial.services.numbering import reserve_document_number
from commercial.services.stock_ledger import post_stock_movement


def _stable_id(namespace: str, value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"oroverde:{namespace}:{value}"))


def _owner_document(owner: OwnerRef) -> dict[str, str]:
    result = {"kind": owner.kind}
    if owner.customer_id is not None:
        result["customer_id"] = owner.customer_id
    return result


def _key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _fingerprint(draft: CommercialProductionDraft) -> str:
    payload = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def complete_commercial_production(
    db: Any,
    draft: CommercialProductionDraft,
    *,
    season_code: str,
    actor_user: dict[str, Any],
    actor_user_id: str,
    production_id: str,
    created_at: datetime,
    session: Any,
) -> dict[str, Any]:
    """Consume owned olive stock and receive actual oil output into one tank.

    This function does not start a transaction. Pass the active session from
    run_transaction; never call it outside that transaction.
    """
    require_commercial_permission(actor_user, "commercial.manage_production")
    if not actor_user_id or not production_id or created_at.tzinfo is None:
        raise ValueError("Authenticated actor, stable ID, and timezone-aware timestamp are required")

    productions = db["commercial_production_runs"]
    fingerprint = _fingerprint(draft)
    prior = await productions.find_one(
        {"idempotency_scope": f"{season_code}:{actor_user_id}",
         "idempotency_key": draft.idempotency_key},
        {"_id": 0}, session=session,
    )
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for a different production request")
        return prior

    owner = draft.owner
    owner_doc = _owner_document(owner)
    quality_gate_evidence: list[dict[str, str]] = []
    source_batch_code: str | None = None
    # Validate every input lot's identity and owner before writing anything.
    for line in draft.inputs:
        lot = await db["commercial_lots"].find_one(
            {"id": line.olive_lot_id},
            {"_id": 0, "id": 1, "product_kind": 1, "status": 1, "owner": 1, "batch_code": 1,
             "preproduction_quality_status": 1, "preproduction_sample_id": 1,
             "preproduction_quality_assessment_id": 1, "latest_preproduction_sample_id": 1},
            session=session,
        )
        if not lot:
            raise ValueError(f"Unknown olive lot: {line.olive_lot_id}")
        source_batch_code = lot.get("batch_code") or lot.get("document_number") or lot.get("document_number")
        if lot.get("product_kind") != "OLIVE":
            raise ValueError(f"Input lot is not olive stock: {line.olive_lot_id}")
        if line.owner != owner:
            raise ValueError(f"Production input owner mismatch: {line.olive_lot_id}")
        if lot.get("owner") != owner_doc:
            raise ValueError(f"Production input owner does not match the source olive lot: {line.olive_lot_id}")
        if lot.get("status") != "OPEN":
            raise ValueError(f"Olive lot is not open: {line.olive_lot_id}")
        if lot.get("preproduction_quality_status") != "RELEASED" or not lot.get("preproduction_sample_id") or not lot.get("preproduction_quality_assessment_id") or lot.get("latest_preproduction_sample_id") != lot.get("preproduction_sample_id"):
            raise ValueError(f"Preproduction quality approval is required before full production: {line.olive_lot_id}")
        sample = await db["commercial_preproduction_samples"].find_one(
            {"id": lot["preproduction_sample_id"], "source_olive_lot_id": line.olive_lot_id, "status": "COMPLETED"},
            {"_id": 0, "id": 1, "oil_sample_lot_id": 1}, session=session,
        )
        sample_oil_lot = await db["commercial_lots"].find_one(
            {"id": sample.get("oil_sample_lot_id") if sample else None,
             "product_kind": "OIL", "lot_purpose": "PREPRODUCTION_SAMPLE",
             "source_preproduction_sample_id": sample.get("id") if sample else None,
             "source_olive_lot_id": line.olive_lot_id, "status": "OPEN", "quality_status": "RELEASED"},
            {"_id": 0, "id": 1, "owner": 1}, session=session,
        )
        assessment = await db["commercial_quality_assessments"].find_one(
            {"id": lot["preproduction_quality_assessment_id"], "oil_lot_id": sample_oil_lot.get("id") if sample_oil_lot else None, "status": "REVIEWED", "decision": "RELEASED"},
            {"_id": 0, "id": 1}, session=session,
        )
        if not sample or not sample_oil_lot or not assessment:
            raise ValueError(f"Preproduction quality approval is missing, rejected, or superseded: {line.olive_lot_id}")
        if sample_oil_lot.get("owner") != owner_doc:
            raise ValueError(f"Preproduction quality approval belongs to a different stock owner: {line.olive_lot_id}")
        quality_gate_evidence.append({
            "olive_lot_id": line.olive_lot_id,
            "sample_id": sample["id"],
            "sample_oil_lot_id": sample_oil_lot["id"],
            "assessment_id": assessment["id"],
        })
        # Write the source lot inside this transaction. Trial creation and quality
        # release update the same document, preventing a stale approval from racing
        # a production command on another receiving location.
        gate_guard = await db["commercial_lots"].update_one(
            {"id": line.olive_lot_id, "status": "OPEN",
             "preproduction_quality_status": "RELEASED",
             "preproduction_sample_id": lot["preproduction_sample_id"],
             "preproduction_quality_assessment_id": lot["preproduction_quality_assessment_id"],
             "latest_preproduction_sample_id": lot["preproduction_sample_id"]},
            {"$inc": {"preproduction_gate_version": 1}},
            session=session,
        )
        if gate_guard.matched_count != 1:
            raise ValueError(f"Preproduction quality approval changed during production validation: {line.olive_lot_id}")

    tank = await db["commercial_tanks"].find_one(
        {"id": draft.output_tank_id, "active": True},
        {"_id": 0, "id": 1, "role": 1}, session=session,
    )
    if not tank:
        raise ValueError("Output tank does not exist or is inactive")
    if tank.get("role", "NORMAL") != "NORMAL":
        raise ValueError("Production output must be received into a normal storage tank")

    run_number = await reserve_document_number(
        db["commercial_counters"], season_code, "PROD", session=session
    )
    oil_lot_number = await reserve_document_number(
        db["commercial_counters"], season_code, "LOT", session=session
    )
    oil_lot_id = _stable_id("production-oil-lot", f"{production_id}:{draft.idempotency_key}")
    created_utc = created_at.astimezone(timezone.utc)

    run = {
        "id": production_id,
        "season_code": season_code,
        "document_type": "PROD",
        "document_number": run_number,
        "production_date": draft.production_date.isoformat(),
        "status": "COMPLETED",
        "version": 1,
        "owner": owner_doc,
        "batch_code": source_batch_code,
        "source_olive_lot_id": draft.inputs[0].olive_lot_id,
        "preproduction_quality_approvals": quality_gate_evidence,
        "inputs": [
            {
                "olive_lot_id": line.olive_lot_id,
                "source_location_id": line.source_location_id,
                "quantity_kg": Decimal128(line.quantity_kg),
            }
            for line in draft.inputs
        ],
        "total_olive_input_kg": Decimal128(draft.total_olive_input_kg),
        "actual_oil_output_kg": Decimal128(draft.actual_oil_output_kg),
        "extraction_rate_percent": Decimal128(draft.extraction_rate_percent),
        "output_tank_id": draft.output_tank_id,
        "output_oil_lot_id": oil_lot_id,
        "idempotency_scope": f"{season_code}:{actor_user_id}",
        "idempotency_key": draft.idempotency_key,
        "request_fingerprint": fingerprint,
        "notes": draft.notes,
        "created_by": actor_user_id,
        "completed_by": actor_user_id,
        "created_at": created_utc,
        "completed_at": created_utc,
    }
    # Insert COMPLETED inside this transaction before ledger movements; the
    # source-document validator can then verify PROD, while rollback prevents
    # any externally visible half-completed run.
    await productions.insert_one(run, session=session)

    oil_lot = {
        "id": oil_lot_id,
        "season_code": season_code,
        "document_type": "LOT",
        "document_number": oil_lot_number,
        "batch_code": source_batch_code,
        "source_olive_lot_id": draft.inputs[0].olive_lot_id,
        "product_kind": "OIL",
        "source_production_id": production_id,
        "quantity_received_kg": Decimal128(draft.actual_oil_output_kg),
        "owner": owner_doc,
        "quality_status": "PENDING",
        "status": "OPEN",
        "version": 1,
        "created_by": actor_user_id,
        "created_at": created_utc,
    }
    await db["commercial_lots"].insert_one(oil_lot, session=session)

    movement_ids: list[str] = []
    for index, line in enumerate(draft.inputs):
        line_key = f"{production_id}:{draft.idempotency_key}:consume:{index}"
        movement_id = _stable_id("production-consumption", line_key)
        await post_stock_movement(
            db,
            StockMovementDraft(
                movement_kind="CONSUMPTION",
                product_kind="OLIVE",
                lot_id=line.olive_lot_id,
                quantity_kg=line.quantity_kg,
                source_location_id=line.source_location_id,
                source_owner=owner,
                source_document_type="PROD",
                source_document_id=production_id,
                idempotency_key=_key(line_key),
                reason=f"Olive input consumed by {run_number}",
            ),
            season_code=season_code,
            actor_user_id=actor_user_id,
            actor_user=actor_user,
            movement_id=movement_id,
            audit_event_id=_stable_id("production-consumption-audit", line_key),
            created_at=created_at,
            session=session,
        )
        movement_ids.append(movement_id)

    receipt_key = f"{production_id}:{draft.idempotency_key}:oil-receipt"
    receipt_id = _stable_id("production-oil-receipt", receipt_key)
    await post_stock_movement(
        db,
        StockMovementDraft(
            movement_kind="RECEIPT",
            product_kind="OIL",
            lot_id=oil_lot_id,
            quantity_kg=draft.actual_oil_output_kg,
            destination_location_id=draft.output_tank_id,
            destination_owner=owner,
            source_document_type="PROD",
            source_document_id=production_id,
            idempotency_key=_key(receipt_key),
            reason=f"Actual oil output received from {run_number}",
        ),
        season_code=season_code,
        actor_user_id=actor_user_id,
        actor_user=actor_user,
        movement_id=receipt_id,
        audit_event_id=_stable_id("production-oil-receipt-audit", receipt_key),
        created_at=created_at,
        session=session,
    )
    movement_ids.append(receipt_id)

    update = await productions.update_one(
        {"id": production_id, "status": "COMPLETED", "version": 1},
        {"$set": {"stock_movement_ids": movement_ids, "updated_at": created_utc}},
        session=session,
    )
    if update.matched_count != 1:
        raise ValueError("Production run changed before stock movement links were saved")

    await db["commercial_audit_events"].insert_one(
        {
            "id": _stable_id("production-completion-audit", f"{production_id}:{draft.idempotency_key}"),
            "entity_type": "commercial_production_run",
            "entity_id": production_id,
            "action": "COMPLETED_AND_STOCK_POSTED",
            "actor_user_id": actor_user_id,
            "created_at": created_utc,
            "details": {
                "document_number": run_number,
                "oil_lot_id": oil_lot_id,
                "oil_lot_number": oil_lot_number,
                "stock_movement_ids": movement_ids,
                "preproduction_quality_approvals": quality_gate_evidence,
                "output_tank_id": draft.output_tank_id,
                "owner": owner_doc,
            },
        },
        session=session,
    )
    result = await productions.find_one({"id": production_id}, {"_id": 0}, session=session)
    return result
