"""Criterion: Rapports (/reports/revenue) totals and SMS log (/sms) only include the
active season's loads."""
import httpx

from tests.helpers import login, set_active_season, season_lock


def test_reports_and_sms_scoped_to_active_season():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            try:
                set_active_season(c, "2025-2026")

                report = c.get("/reports/revenue", params={"start": "2025-10-01", "end": "2026-10-24"}).json()
                codes_in_period = sum(r["loads"] for r in report["rows"])
                assert codes_in_period == report["total"]["loads"]
                # every load behind this total must belong to 2025-2026 (sanity via /loads)
                season_loads = c.get("/loads").json()
                assert all(l["season"] == "2025-2026" for l in season_loads)
                assert report["total"]["loads"] == len(season_loads)

                sms_rows = c.get("/sms").json()
                assert sms_rows, "expected seeded SMS for 2025-2026 loads"
                assert all(s["code"].startswith("25") or s["code"].startswith("26") for s in sms_rows)
                season_codes = {l["code"] for l in season_loads}
                assert all(s["code"] in season_codes for s in sms_rows), "sms log leaked another season's load"

                # switch season: the previous SMS rows for 2025-2026 loads must no longer surface
                set_active_season(c, "2026-2027")
                sms_rows_other = c.get("/sms").json()
                leaked = [s for s in sms_rows_other if s["code"] in season_codes]
                assert not leaked, f"SMS log leaked 2025-2026 rows into 2026-2027: {leaked}"
            finally:
                set_active_season(c, "")
