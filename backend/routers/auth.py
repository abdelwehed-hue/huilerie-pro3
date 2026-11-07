import os

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import COOKIE, TTL_DAYS, current_user, make_token, verify_password
from lib.db import db
from models.schemas import LoginIn, User
from routers.admin import _user

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_cookie_options() -> dict:
    secure = os.environ.get("COOKIE_SECURE", "true").strip().lower() in {"1", "true", "yes", "on"}
    same_site = os.environ.get("COOKIE_SAMESITE", "none").strip().lower()
    if same_site not in {"lax", "strict", "none"}:
        raise RuntimeError("COOKIE_SAMESITE must be lax, strict, or none")
    if same_site == "none" and not secure:
        raise RuntimeError("SameSite=None cookies require COOKIE_SECURE=true")
    return {"httponly": True, "samesite": same_site, "secure": secure, "path": "/"}


@router.get("/login-image")
async def get_login_image():
    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, "login_image": 1}) or {}
    return {"login_image": settings.get("login_image", "")}


@router.post("/login", response_model=User)
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"username": body.username.strip().lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "bad_credentials")
    if not user.get("active"):
        raise HTTPException(403, "account_disabled")
    response.set_cookie(
        COOKIE,
        make_token(user["id"]),
        max_age=TTL_DAYS * 86400,
        **_session_cookie_options(),
    )
    return _user(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE, **_session_cookie_options())
    return {"ok": True}


@router.get("/me", response_model=User)
async def me(user: dict = Depends(current_user)):
    return _user(user)
