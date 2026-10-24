import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require_admin
from lib.db import db
from lib.season import season_filter
from pymongo import ReturnDocument
from models.schemas import LabAnalysis, LabCreate

router = APIRouter(prefix="/lab", tags=["lab"])


def classify(b: LabCreate) -> str:
    def ok(v, lim):
        return v is None or v <= lim
    if b.acidity <= 0.8 and ok(b.peroxide, 20) and ok(b.k232, 2.5) and ok(b.k270, 0.22):
        return "extra_vierge"
    if b.acidity <= 2.0 and ok(b.peroxide, 20) and ok(b.k232, 2.6) and ok(b.k270, 0.25):
        return "vierge"
    return "lampante"


def _out(doc: dict) -> LabAnalysis:
    dt = doc["created_at"]
    return LabAnalysis(**{**doc, "created_at": dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)})


@router.get("", response_model=list[LabAnalysis])
async def list_lab(_: dict = Depends(current_user)):
    docs = await db.lab.find(await season_filter(), {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_out(d) for d in docs]


@router.post("", response_model=LabAnalysis)
async def create_lab(body: LabCreate, user: dict = Depends(current_user)):
    load = await db.loads.find_one({"code": body.code.strip(), **(await season_filter())}, {"_id": 0})
    if not load:
        raise HTTPException(404, "code_not_found")
    if load.get("cancelled"):
        raise HTTPException(409, "load_cancelled")
    fields = {
        **body.model_dump(),
        "code": load["code"], "season_id": load.get("season_id"),
        "client_name": load["client_name"],
        "classification": body.classification or classify(body),
        "oil_type": (body.oil_type or "").strip() or None,
    }
    # One analysis per receipt: update the existing (latest) analysis of this code instead of adding another.
    existing = await db.lab.find_one({"load_id": load["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if existing:
        fields.update(updated_at=datetime.now(timezone.utc), updated_by=user["username"])
        doc = await db.lab.find_one_and_update(
            {"id": existing["id"]}, {"$set": fields}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        return _out(doc)
    doc = {
        **fields, "id": str(uuid.uuid4()), "load_id": load["id"],
        "created_at": datetime.now(timezone.utc), "created_by": user["username"],
    }
    await db.lab.insert_one(doc)
    doc.pop("_id", None)
    return _out(doc)


@router.delete("/{id}")
async def delete_lab(id: str, _: dict = Depends(require_admin)):
    res = await db.lab.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "not_found")
    return {"ok": True}
