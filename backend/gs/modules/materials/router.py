"""Material traceability — one permanent code through all stages."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from gs.core.permissions import require_gs_access
from gs.database.connection import get_gs_db

router = APIRouter(prefix="/materials", tags=["gs-materials"])


def _serialize(doc: dict) -> dict:
    for k, v in list(doc.items()):
        if hasattr(v, "to_decimal"):
            doc[k] = str(v.to_decimal())
    return doc


@router.get("")
async def list_materials(
    q: str = Query(""),
    season: str = Query(""),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(require_gs_access),
):
    db = get_gs_db()
    filt: dict = {}
    if season:
        filt["season"] = season
    if q.strip():
        filt["$or"] = [
            {"material_code": {"$regex": q.strip(), "$options": "i"}},
            {"material_name": {"$regex": q.strip(), "$options": "i"}},
        ]
    rows = await db.gs_materials.find(filt, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [_serialize(r) for r in rows]


@router.get("/{material_code}")
async def get_material(material_code: str, user: dict = Depends(require_gs_access)):
    db = get_gs_db()
    doc = await db.gs_materials.find_one({"material_code": material_code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "material_not_found")
    return _serialize(doc)


@router.get("/{material_code}/history")
async def material_history(material_code: str, user: dict = Depends(require_gs_access)):
    db = get_gs_db()
    mat = await db.gs_materials.find_one({"material_code": material_code}, {"_id": 0})
    if not mat:
        raise HTTPException(404, "material_not_found")
    events = await db.gs_material_events.find(
        {"material_code": material_code}, {"_id": 0}
    ).sort("at", 1).to_list(1000)
    return {"material": _serialize(mat), "events": [_serialize(e) for e in events]}
