"""Canonical Tunisian dinar arithmetic and MongoDB storage helpers.

All monetary values are represented in TND with three decimal places.
MongoDB persistence uses Decimal128; API-facing legacy numeric responses can
use money_float() at the boundary.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from bson.decimal128 import Decimal128

TND_QUANTUM = Decimal("0.001")
ZERO_TND = Decimal("0.000")


def to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return ZERO_TND
    if isinstance(value, Decimal128):
        return value.to_decimal()
    if isinstance(value, Decimal):
        return value
    raw = str(value).strip().replace(" ", "").replace("\u00a0", "").replace("\u202f", "")
    if "," in raw and "." not in raw:
        raw = raw.replace(",", ".")
    try:
        return Decimal(raw)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("invalid_tnd_amount") from exc


def money_decimal(value: Any) -> Decimal:
    return to_decimal(value).quantize(TND_QUANTUM, rounding=ROUND_HALF_UP)


def money_db(value: Any) -> Decimal128:
    return Decimal128(money_decimal(value))


def money_float(value: Any) -> float:
    try:
        return float(money_decimal(value))
    except (InvalidOperation, ValueError, TypeError, OverflowError):
        return 0.0
