"""Fail-closed runtime security configuration shared by HTTP and WebSocket."""
from __future__ import annotations
import os

_DEVELOPMENT_ORIGINS = (
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
)

def is_production() -> bool:
    return (
        os.environ.get("APP_ENV", "").strip().lower() == "production"
        or os.environ.get("RENDER", "").strip().lower() in {"1", "true", "yes"}
    )

def auth_is_disabled() -> bool:
    return os.environ.get("AUTH_DISABLED", "false").strip().lower() in {"1", "true", "yes", "on"}

def cors_origins() -> list[str]:
    configured = os.environ.get("CORS_ORIGINS", "").strip()
    if not configured:
        if is_production():
            raise RuntimeError("CORS_ORIGINS must be explicitly configured in production")
        return list(_DEVELOPMENT_ORIGINS)
    origins = [item.strip().rstrip("/") for item in configured.split(",") if item.strip()]
    if not origins or "*" in origins:
        raise RuntimeError("CORS_ORIGINS must be a non-empty explicit origin allowlist")
    if any(not (item.startswith("https://") or item.startswith("http://")) for item in origins):
        raise RuntimeError("CORS_ORIGINS contains an invalid origin")
    if len(set(origins)) != len(origins):
        raise RuntimeError("CORS_ORIGINS contains duplicate origins")
    return origins

def validate_runtime_security() -> None:
    if is_production() and auth_is_disabled():
        raise RuntimeError("AUTH_DISABLED must be false in production")
    cors_origins()

def initial_admin_credentials() -> tuple[str, str, str]:
    if is_production():
        username = os.environ.get("INITIAL_ADMIN_USERNAME", "").strip()
        password = os.environ.get("INITIAL_ADMIN_PASSWORD", "")
        if not username or len(password) < 16:
            raise RuntimeError("Set INITIAL_ADMIN_USERNAME and a unique INITIAL_ADMIN_PASSWORD of at least 16 characters before first production startup")
        if username.casefold() in {"admin", "administrator"}:
            raise RuntimeError("Choose a non-default INITIAL_ADMIN_USERNAME")
        return username, "Administrateur", password
    return "admin", "Administrateur", "admin123"
