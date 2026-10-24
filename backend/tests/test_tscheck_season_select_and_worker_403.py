"""Criterion: Admin can create/select a season; header/settings reflect active season;
worker cannot change it (PUT /api/seasons/active returns 403)."""
import httpx

from tests.helpers import login, set_active_season, get_seasons, season_lock


def test_admin_can_select_season_and_restore_auto():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            before = get_seasons(c)
            assert "2025-2026" in before["available"]

            r = set_active_season(c, "2025-2026")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["active"] == "2025-2026"
            assert body["auto"] is False

            after = get_seasons(c)
            assert after["active"] == "2025-2026"

            # restore auto as required by test plan
            r2 = set_active_season(c, "")
            assert r2.status_code == 200, r2.text
            restored = get_seasons(c)
            assert restored["auto"] is True
            assert restored["active"] == restored["current"]


def test_worker_cannot_change_active_season():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "ouvrier", "ouvrier123")
            r = set_active_season(c, "2025-2026")
            assert r.status_code == 403, r.text

        # sanity: season must still be auto/unchanged after the rejected attempt
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c2:
            login(c2, "admin", "admin123")
            state = get_seasons(c2)
            assert state["auto"] is True
