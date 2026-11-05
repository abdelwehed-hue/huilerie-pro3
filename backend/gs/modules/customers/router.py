"""GS Customers — independent directory (no legacy import)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from gs.core.audit import write_audit
from gs.core.permissions import require_gs_access, require_permission
from gs.database.connection import get_gs_db

router = APIRouter(prefix="/customers", tags=["gs-customers"])


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=400)
    notes: str = Field(default="", max_length=1000)
    identification: str = Field(default="", max_length=100)


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    address: Optional[str] = Field(default=None, max_length=400)
    notes: Optional[str] = Field(default=None, max_length=1000)
    identification: Optional[str] = Field(default=None, max_length=100)
    active: Optional[bool] = None


@router.get("")
async def list_customers(
    q: str = Query(""),
    active_only: bool = True,
    user: dict = Depends(require_permission("gs.read", "gs.manage_customers")),
):
    db = get_gs_db()
    filt: dict = {}
    if active_only:
        filt["active"] = True
    if q.strip():
        filt["$or"] = [
            {"name": {"$regex": q.strip(), "$options": "i"}},
            {"phone": {"$regex": q.strip(), "$options": "i"}},
        ]
    rows = await db.gs_customers.find(filt, {"_id": 0}).sort("name", 1).to_list(500)
    return rows


@router.post("")
async def create_customer(body: CustomerCreate, user: dict = Depends(require_permission("gs.manage_customers"))):
    db = get_gs_db()
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": cid,
        "name": body.name.strip(),
        "phone": body.phone.strip(),
        "address": body.address.strip(),
        "notes": body.notes.strip(),
        "identification": body.identification.strip(),
        "active": True,
        "balance": "0",
        "created_at": now,
        "created_by": user["id"],
    }
    await db.gs_customers.insert_one(doc)
    await write_audit(user_id=user["id"], action="create", module="customers", document_id=cid, after=doc)
    doc.pop("_id", None)
    return doc


@router.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(require_gs_access)):
    db = get_gs_db()
    doc = await db.gs_customers.find_one({"id": customer_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "customer_not_found")
    return doc


@router.patch("/{customer_id}")
async def update_customer(
    customer_id: str,
    body: CustomerUpdate,
    user: dict = Depends(require_permission("gs.manage_customers")),
):
    db = get_gs_db()
    before = await db.gs_customers.find_one({"id": customer_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "customer_not_found")
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        return before
    for k in ("name", "phone", "address", "notes", "identification"):
        if k in updates and isinstance(updates[k], str):
            updates[k] = updates[k].strip()
    updates["updated_at"] = datetime.now(timezone.utc)
    updates["updated_by"] = user["id"]
    await db.gs_customers.update_one({"id": customer_id}, {"$set": updates})
    after = await db.gs_customers.find_one({"id": customer_id}, {"_id": 0})
    await write_audit(
        user_id=user["id"], action="update", module="customers",
        document_id=customer_id, before=before, after=after,
    )
    return after
