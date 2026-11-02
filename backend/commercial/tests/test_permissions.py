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
