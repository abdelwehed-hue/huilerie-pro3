"""Criterion: pre-existing 10-digit-code loads (dated Oct 2026) stay visible under the
2026-2027 season with their oil/lab data intact — nothing deleted by the seasons feature."""
import httpx

from tests.helpers import login, set_active_season, season_lock


def test_old_ten_digit_loads_visible_in_2026_2027_with_data():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            try:
                set_active_season(c, "2026-2027")
                loads = c.get("/loads").json()
                ten_digit = [l for l in loads if len(l["code"]) == 10 and l["code"].isdigit()]
                assert len(ten_digit) >= 20, f"expected ~28 legacy loads, found {len(ten_digit)}"
                assert all(l["season"] == "2026-2027" for l in ten_digit)

                lab_rows = c.get("/lab").json()
                assert any(len(l["code"]) == 10 for l in lab_rows), "legacy lab analyses missing"

                with_oil = [l for l in ten_digit if l["oil_kg"] is not None]
                assert with_oil, "legacy oil data missing"
            finally:
                set_active_season(c, "")
