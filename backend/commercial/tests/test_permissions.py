import pytest

from commercial.permissions import require_commercial_permission


def test_admin_has_commercial_quality_permissions():
    admin = {"active": True, "role": "admin"}
    require_commercial_permission(admin, "commercial.lab_record")
    require_commercial_permission(admin, "commercial.quality_release")
    require_commercial_permission(admin, "commercial.post_stock")
    require_commercial_permission(admin, "commercial.manage_custody")
    require_commercial_permission(admin, "commercial.view_audit")


def test_worker_can_receive_only_explicit_scoped_commercial_permissions():
    lab = {"active": True, "role": "worker", "commercial_permissions": ["commercial.lab_record", "commercial.view_audit"]}
    reviewer = {"active": True, "role": "worker", "commercial_permissions": ["commercial.quality_release"]}
    require_commercial_permission(lab, "commercial.read")
    require_commercial_permission(lab, "commercial.lab_record")
    require_commercial_permission(lab, "commercial.view_audit")
    with pytest.raises(PermissionError):
        require_commercial_permission(lab, "commercial.quality_release")
    require_commercial_permission(reviewer, "commercial.quality_release")
    with pytest.raises(PermissionError):
        require_commercial_permission(reviewer, "commercial.lab_record")
    with pytest.raises(PermissionError):
        require_commercial_permission(reviewer, "commercial.post_stock")
    with pytest.raises(PermissionError):
        require_commercial_permission(reviewer, "commercial.manage_custody")
    with pytest.raises(PermissionError):
        require_commercial_permission(reviewer, "commercial.view_audit")


@pytest.mark.parametrize("user", [
    {"active": False, "role": "admin"},
    {"active": True, "role": "unknown"},
    {},
])
def test_inactive_or_unknown_user_has_no_commercial_permissions(user):
    with pytest.raises(PermissionError):
        require_commercial_permission(user, "commercial.read")


def test_commercial_api_router_exposes_quality_submission_and_separate_release(monkeypatch):
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
    assert "/commercial/v1/quality-assessments/release" in paths
    assert "/commercial/v1/customer-custody/receipts" in paths
    assert "/commercial/v1/customer-custody/releases" in paths
    assert "/commercial/v1/customer-custody/owners/{customer_id}/statement" in paths
    assert "/commercial/v1/sales-invoices/{invoice_id}/credit-applications" in paths
    assert "/commercial/v1/sale-payments/{payment_id}/reversals" in paths
    assert "/commercial/v1/sales-invoices/{invoice_id}/payment-reversals" in paths
    assert "/commercial/v1/sale-payments/{payment_id}/reversals" in paths
    assert "/commercial/v1/audit-events" in paths
    audit_route = next(route for route in router.routes if route.path == "/commercial/v1/audit-events")
    assert audit_route.methods == {"GET"}
    assert "/commercial/v1/me/permissions" in paths
    assert "/commercial/v1/users/{target_user_id}/commercial-permissions" in paths
