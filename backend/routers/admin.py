import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import hash_password, require_admin
from lib.db import db
from models.schemas import AppSettings, User, UserCreate, UserUpdate

router = APIRouter(tags=["admin"])


def _user(doc: dict) -> User:
    dt = doc["created_at"]
    return User(**{**doc, "created_at": dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)})


@router.get("/users", response_model=list[User])
async def list_users(_: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)
    return [_user(d) for d in docs]


@router.post("/users", response_model=User)
async def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    username = body.username.strip().lower()
    if await db.users.find_one({"username": username}):
        raise HTTPException(409, "username_taken")
    doc = {
        "id": str(uuid.uuid4()), "username": username, "full_name": body.full_name.strip(),
        "password_hash": hash_password(body.password), "role": body.role, "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    return _user(doc)


@router.patch("/users/{id}", response_model=User)
async def update_user(id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    upd: dict = {}
    if body.full_name is not None:
        upd["full_name"] = body.full_name.strip()
    if body.role is not None:
        upd["role"] = body.role
    if body.active is not None:
        upd["active"] = body.active
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    if id == admin["id"] and (upd.get("active") is False or upd.get("role") == "worker"):
        raise HTTPException(400, "cannot_demote_self")
    doc = await db.users.find_one_and_update(
        {"id": id}, {"$set": upd} if upd else {"$set": {}},
        projection={"_id": 0, "password_hash": 0}, return_document=True,
    ) if upd else await db.users.find_one({"id": id}, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(404, "not_found")
    return _user(doc)


@router.get("/settings", response_model=AppSettings)
async def get_settings(_: dict = Depends(require_admin)):
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "key": 0}) or {"price_per_kg": 0}
    return AppSettings(**s)


@router.put("/settings", response_model=AppSettings)
async def put_settings(body: AppSettings, _: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "app"}, {"$set": body.model_dump()}, upsert=True)
    return body
