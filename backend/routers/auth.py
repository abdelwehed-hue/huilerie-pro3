from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import COOKIE, TTL_DAYS, current_user, make_token, verify_password
from lib.db import db
from models.schemas import LoginIn, User
from routers.admin import _user

router = APIRouter(prefix="/auth", tags=["auth"])


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
        httponly=True,
        samesite="none",
        secure=True,
        max_age=TTL_DAYS * 86400,
        path="/",
    )
    return _user(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        COOKIE,
        path="/",
        httponly=True,
        samesite="none",
        secure=True,
    )
    return {"ok": True}


@router.get("/me", response_model=User)
async def me(user: dict = Depends(current_user)):
    return _user(user)
