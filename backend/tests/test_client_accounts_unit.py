"""Unit tests for the read-only client account calculations."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from routers import client_accounts as accounts


def test_itemized_partial_payments_are_counted_once():
    invoice = {
        "paid_amount": 35.0,
        "created_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
        "payments": [
            {"amount": 10.0, "at": datetime(2026, 10, 2, tzinfo=timezone.utc)},
            {"amount": 25.0, "at": datetime(2026, 10, 5, tzinfo=timezone.utc)},
        ],
    }
    events = accounts._payment_events(invoice)
    assert [event["amount"] for event in events] == [10.0, 25.0]
    assert round(sum(event["amount"] for event in events), 3) == invoice["paid_amount"]


def test_legacy_paid_amount_without_payment_history_is_one_credit():
    invoice = {
        "paid_amount": 18.5,
        "created_at": datetime(2026, 10, 3, tzinfo=timezone.utc),
        "payments": [],
    }
    events = accounts._payment_events(invoice)
    assert len(events) == 1
    assert events[0]["amount"] == 18.5
    assert events[0]["legacy"] is True


def test_inconsistent_oversized_payment_array_does_not_double_count():
    invoice = {
        "paid_amount": 20.0,
        "created_at": datetime(2026, 10, 3, tzinfo=timezone.utc),
        "payments": [
            {"amount": 15.0, "at": datetime(2026, 10, 4, tzinfo=timezone.utc)},
            {"amount": 15.0, "at": datetime(2026, 10, 5, tzinfo=timezone.utc)},
        ],
    }
    events = accounts._payment_events(invoice)
    assert len(events) == 1
    assert events[0]["amount"] == 20.0


def test_missing_itemized_history_is_filled_only_by_aggregate_difference():
    invoice = {
        "paid_amount": 30.0,
        "created_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
        "payments": [{"amount": 10.0, "at": datetime(2026, 10, 2, tzinfo=timezone.utc)}],
    }
    events = accounts._payment_events(invoice)
    assert sorted(event["amount"] for event in events) == [10.0, 20.0]
    assert sum(event["amount"] for event in events) == 30.0


def test_season_period_is_october_to_next_october():
    first, after_last = accounts._period("2026-2027")
    assert first.isoformat() == "2026-10-01"
    assert after_last.isoformat() == "2027-10-01"


def test_invalid_season_is_rejected():
    with pytest.raises(HTTPException) as exc:
        accounts._period("2026-2028")
    assert exc.value.status_code == 422


def test_custom_period_requires_both_dates_and_valid_order():
    with pytest.raises(HTTPException):
        accounts._period("all", "2026-10-01", "")
    with pytest.raises(HTTPException):
        accounts._period("all", "2026-10-10", "2026-10-01")
    first, after_last = accounts._period("all", "2026-10-01", "2026-10-31")
    assert first.isoformat() == "2026-10-01"
    assert after_last.isoformat() == "2026-11-01"
