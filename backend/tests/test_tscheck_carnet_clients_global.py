"""Criterion: Carnet clients (GET /api/clients) stays global across seasons — a client
whose only receptions are in another season is still listed (no duplicate rows) and can
be used to create a new reception in the currently active season."""
import httpx

from tests.helpers import login, set_active_season, season_lock


def test_client_listed_globally_and_no_duplicate_after_season_switch():
    phone = "99900033"
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            try:
                set_active_season(c, "2025-2026")
                c.post("/loads", json={"client_name": "tscheck-carnet-client", "phone": phone, "olive_kg": 5})

                clients_a = c.get("/clients").json()
                matches_a = [x for x in clients_a if x["phone"] == phone]
                assert len(matches_a) == 1, matches_a

                set_active_season(c, "2026-2027")
                clients_b = c.get("/clients").json()
                matches_b = [x for x in clients_b if x["phone"] == phone]
                assert len(matches_b) == 1, "client disappeared or duplicated after season switch"

                # client usable to create a load in the now-active season
                new_load = c.post(
                    "/loads",
                    json={"client_name": "tscheck-carnet-client", "phone": phone, "olive_kg": 7},
                )
                assert new_load.status_code == 200, new_load.text
                assert new_load.json()["season"] == "2026-2027"

                clients_c = c.get("/clients").json()
                matches_c = [x for x in clients_c if x["phone"] == phone]
                assert len(matches_c) == 1, "duplicate client row created"
            finally:
                set_active_season(c, "")
