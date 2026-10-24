"""Criterion: switching back to an earlier season restores its data — the old receipt is
findable again via search and its lab analysis reappears in Laboratoire."""
import httpx

from tests.helpers import login, set_active_season, season_lock


def test_switch_back_restores_old_season_data():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            try:
                set_active_season(c, "2025-2026")
                found = c.get("/loads", params={"q": "2526100"}).json()
                assert any(l["code"] == "2526100" for l in found), found

                lab_rows = c.get("/lab").json()
                assert any(l["code"] == "2526100" for l in lab_rows), "seeded lab analysis missing"

                # hop away and back
                set_active_season(c, "2026-2027")
                absent = c.get("/loads", params={"q": "2526100"}).json()
                assert not any(l["code"] == "2526100" for l in absent)

                set_active_season(c, "2025-2026")
                restored = c.get("/loads", params={"q": "2526100"}).json()
                assert any(l["code"] == "2526100" for l in restored), "data not restored after switching back"
                lab_restored = c.get("/lab").json()
                assert any(l["code"] == "2526100" for l in lab_restored)
            finally:
                set_active_season(c, "")
