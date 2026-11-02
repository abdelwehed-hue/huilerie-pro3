from commercial.schemas.purchases import ApproveOlivePurchaseCommand
from commercial.services.purchase_approval import _approval_fingerprint


def test_approval_fingerprint_includes_receiving_location_and_version():
    first = ApproveOlivePurchaseCommand(
        expected_version=1,
        receiving_location_id="olive-yard-a",
        idempotency_key="approve-purchase-retry-0001",
    )
    same_request = ApproveOlivePurchaseCommand(
        expected_version=1,
        receiving_location_id="olive-yard-a",
        idempotency_key="approve-purchase-retry-0001",
    )
    changed_location = ApproveOlivePurchaseCommand(
        expected_version=1,
        receiving_location_id="olive-yard-b",
        idempotency_key="approve-purchase-retry-0001",
    )
    assert _approval_fingerprint(first) == _approval_fingerprint(same_request)
    assert _approval_fingerprint(first) != _approval_fingerprint(changed_location)
