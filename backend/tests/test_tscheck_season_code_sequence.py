"""Criterion: new receptions get season code = 2-digit prefix of both years + sequence
starting at 100; existing 10-digit codes stay unchanged."""
import re

import httpx

from tests.helpers import login, get_seasons, season_lock


def create_load(c: httpx.Client, phone: str, name: str):
    r = c.post("/loads", json={"client_name": name, "phone": phone, "olive_kg": 42})
    assert r.status_code == 200, r.text
    return r.json()


def test_new_load_code_matches_active_season_prefix():
    with season_lock():
        with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
            login(c, "admin", "admin123")
            seasons = get_seasons(c)
            active = seasons["active"]
            y1, y2 = active.split("-")
            expected_prefix = y1[-2:] + y2[-2:]

            load = create_load(c, "99900011", "tscheck-code-seq")
            assert re.fullmatch(rf"{expected_prefix}\d{{3,}}", load["code"]), load["code"]
            seq_part = load["code"][len(expected_prefix):]
            assert int(seq_part) >= 100, load["code"]
            assert load["season"] == active


def test_existing_ten_digit_codes_unchanged():
    with httpx.Client(base_url="http://localhost:8001/api", timeout=30.0) as c:
        login(c, "admin", "admin123")
        r = c.get("/loads", params={"season": "all", "q": "2610180407"})
        assert r.status_code == 200, r.text
        rows = r.json()
        assert any(l["code"] == "2610180407" for l in rows), rows
