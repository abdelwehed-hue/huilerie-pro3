"""Unit-style tests for GS numbering format."""
from gs.core.seasons import season_code
from lib.season import valid_season


def test_season_code_format():
    assert season_code("2026-2027") == "2627"
    assert season_code("2027-2028") == "2728"


def test_valid_season():
    assert valid_season("2026-2027") is True
    assert valid_season("2026-2028") is False
    assert valid_season("") is False


def test_material_code_pattern():
    sc = season_code("2026-2027")
    code = f"{sc}A{8:04d}"
    assert code == "2627A0008"


def test_invoice_code_pattern():
    sc = season_code("2026-2027")
    code = f"{sc}F{1:04d}"
    assert code == "2627F0001"
