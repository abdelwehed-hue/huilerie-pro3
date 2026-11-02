import pytest

from lib.security_config import (
    auth_is_disabled,
    cors_origins,
    initial_admin_credentials,
    validate_runtime_security,
)


def test_development_uses_localhost_allowlist_without_wildcard(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    origins = cors_origins()
    assert "http://localhost:5173" in origins
    assert "*" not in origins


@pytest.mark.parametrize("value", ["*", "https://app.example.com,*"])
def test_wildcard_cors_is_rejected(monkeypatch, value):
    monkeypatch.setenv("CORS_ORIGINS", value)
    with pytest.raises(RuntimeError, match="explicit origin allowlist"):
        cors_origins()


def test_production_requires_explicit_cors(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_runtime_security()


def test_production_rejects_public_auth_mode(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_DISABLED", "true")
    monkeypatch.setenv("CORS_ORIGINS", "https://oroverde.com")
    with pytest.raises(RuntimeError, match="AUTH_DISABLED"):
        validate_runtime_security()


def test_production_requires_unique_strong_initial_admin_credentials(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "mill-owner")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "a-unique-long-secret-2026")
    assert initial_admin_credentials() == (
        "mill-owner", "Administrateur", "a-unique-long-secret-2026"
    )


def test_production_rejects_demo_admin_credentials(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "a-unique-long-secret-2026")
    with pytest.raises(RuntimeError, match="non-default"):
        initial_admin_credentials()


def test_auth_disabled_parser(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "yes")
    assert auth_is_disabled()
    monkeypatch.setenv("AUTH_DISABLED", "false")
    assert not auth_is_disabled()
