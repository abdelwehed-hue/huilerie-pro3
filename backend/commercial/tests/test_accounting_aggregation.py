from routers.accounting import _sum_pipeline


def test_accounting_sum_converts_amounts_to_decimal_before_aggregation():
    pipeline = _sum_pipeline("net_amount_dt")

    assert pipeline[0] == {
        "$group": {
            "_id": None,
            "total": {
                "$sum": {
                    "$convert": {
                        "input": "$net_amount_dt",
                        "to": "decimal",
                        "onError": 0,
                        "onNull": 0,
                    }
                }
            },
        }
    }
    assert pipeline[1] == {
        "$project": {"_id": 0, "total": {"$toString": "$total"}}
    }


def test_accounting_sum_applies_source_document_filters_before_grouping():
    match = {
        "status": "APPROVED",
        "movement_kind": "OWNERSHIP_TRANSFER",
        "product_kind": "OLIVE",
        "consideration.type": "SALE",
    }
    pipeline = _sum_pipeline("consideration.agreed_amount", match)

    assert pipeline[0] == {"$match": match}
    assert pipeline[1]["$group"]["total"]["$sum"]["$convert"]["input"] == (
        "$consideration.agreed_amount"
    )


from datetime import datetime, timezone
from decimal import Decimal

from routers.accounting import _accounting_day, _accounting_decimal, _daily_event


def test_accounting_day_uses_tunis_business_timezone_for_timestamps():
    timestamp = datetime(2026, 11, 12, 23, 30, tzinfo=timezone.utc)
    assert _accounting_day(timestamp) == "2026-11-13"


def test_accounting_day_preserves_explicit_business_date():
    assert _accounting_day("2026-11-12") == "2026-11-12"


def test_daily_event_keeps_millime_precision_without_float_rounding():
    events = []
    _daily_event(
        events, day="2026-11-12", category="Prestation",
        label="Facture", reference="FAC-1", amount="1999.800",
        kind="revenue",
    )
    assert events == [{
        "date": "2026-11-12", "category": "Prestation",
        "label": "Facture", "reference": "FAC-1",
        "amount": "1999.800", "kind": "revenue", "detail": "",
    }]


def test_accounting_decimal_handles_decimal_and_invalid_values():
    assert _accounting_decimal("1.250") == Decimal("1.250")
    assert _accounting_decimal("not-a-number") == Decimal("0.000")
