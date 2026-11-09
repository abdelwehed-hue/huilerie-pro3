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
