"""Criterion: a reception created while a season is active appears only in that season
(Chargements/Recherche/Lab/Dashboard), and disappears from those views after switching
to a different season, while existing data in other seasons is preserved."""
import httpx

from tests.helpers import login, set_active_season, get_seasons, season_lock


def test_reception_scoped_to_its_season_then_hidden_after_switch():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            original = get_seasons(c)
            try:
                r = set_active_season(c, "2025-2026")
                assert r.status_code == 200, r.text

                load = c.post(
                    "/loads",
                    json={"client_name": "tscheck-scope-client", "phone": "99900022", "olive_kg": 10},
                ).json()
                assert load["season"] == "2025-2026"
                code = load["code"]

                # visible while 2025-2026 active: default loads list + search by code
                visible = c.get("/loads").json()
                assert any(l["code"] == code for l in visible), "not visible in active season list"
                found = c.get("/loads", params={"q": code}).json()
                assert any(l["code"] == code for l in found)

                # stats reflect the active season
                stats = c.get("/stats").json()
                assert stats["season"] == "2025-2026"

                # switch to 2026-2027: the reception must disappear from scoped views
                r2 = set_active_season(c, "2026-2027")
                assert r2.status_code == 200, r2.text

                hidden_list = c.get("/loads").json()
                assert not any(l["code"] == code for l in hidden_list), "leaked into other season list"
                hidden_search = c.get("/loads", params={"q": code}).json()
                assert not any(l["code"] == code for l in hidden_search), "leaked into other season search"

                # but still retrievable with season=all (not deleted)
                still_there = c.get("/loads", params={"season": "all", "q": code}).json()
                assert any(l["code"] == code for l in still_there), "reception was deleted, not just scoped"
            finally:
                set_active_season(c, "")
