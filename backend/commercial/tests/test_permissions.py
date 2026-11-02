import pytest

from commercial.permissions import require_commercial_permission


def test_admin_can_post_commercial_stock():
    require_commercial_permission(
        {"active": True, "role": "admin"}, "commercial.post_stock"
    )


@pytest.mark.parametrize("user", [
    {"active": True, "role": "worker"},
    {"active": False, "role": "admin"},
    {"active": True, "role": "unknown"},
    {},
])
def test_non_admin_or_inactive_user_cannot_post_stock(user):
    with pytest.raises(PermissionError):
        require_commercial_permission(user, "commercial.post_stock")


def test_worker_can_only_read_commercial_module():
    require_commercial_permission({"active": True, "role": "worker"}, "commercial.read")
    with pytest.raises(PermissionError):
        require_commercial_permission({"active": True, "role": "worker"}, "commercial.manage_sales")


def test_commercial_api_router_exposes_only_versioned_commercial_paths(monkeypatch):
    import os

    monkeypatch.setenv("JWT_SECRET", "commercial-router-test-secret")
    monkeypatch.setenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    monkeypatch.setenv("DB_NAME", "commercial_router_test")

    from commercial.routers import router

    paths = {route.path for route in router.routes}
    assert "/commercial/v1/bootstrap" in paths
    assert "/commercial/v1/olive-purchases" in paths
    assert "/commercial/v1/production-runs" in paths
    assert "/commercial/v1/quality-assessments" in paths
