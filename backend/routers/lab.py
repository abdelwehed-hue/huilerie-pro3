import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require_admin
from lib.db import db
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
    docs = await db.lab.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_out(d) for d in docs]


@router.post("", response_model=LabAnalysis)
async def create_lab(body: LabCreate, user: dict = Depends(current_user)):
    load = await db.loads.find_one({"code": body.code.strip()}, {"_id": 0})
    if not load:
        raise HTTPException(404, "code_not_found")
    doc = {
        **body.model_dump(),
        "id": str(uuid.uuid4()), "load_id": load["id"], "code": load["code"],
        "client_name": load["client_name"],
        "classification": body.classification or classify(body),
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
