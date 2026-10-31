import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from passlib.hash import pbkdf2_sha256

from lib.db import db

COOKIE = "olive_session"
JWT_SECRET = os.environ["JWT_SECRET"]
TTL_DAYS = 30


def hash_password(pw: str) -> str:
    return pbkdf2_sha256.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return pbkdf2_sha256.verify(pw, hashed)
    except ValueError:
        return False


def make_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TTL_DAYS)
    return jwt.encode({"sub": user_id, "exp": exp}, JWT_SECRET, algorithm="HS256")


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "not_authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid_session")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user or not user.get("active"):
        raise HTTPException(401, "inactive")
    return user


async def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "admin_only")
    return user


async def seed_defaults() -> None:
    """Idempotent: default admin + demo worker + price setting."""
    now = datetime.now(timezone.utc)
    defaults = [
        ("admin", "Administrateur", "admin123", "admin"),
        ("ouvrier", "Ouvrier Démo", "ouvrier123", "worker"),
    ]
    if await db.users.count_documents({}) == 0:
        for username, name, pw, role in defaults:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "username": username, "full_name": name,
                "password_hash": hash_password(pw), "role": role, "active": True, "created_at": now,
            })
    if not await db.settings.find_one({"key": "app"}):
        await db.settings.insert_one({"key": "app", "price_per_kg": 0.18})
