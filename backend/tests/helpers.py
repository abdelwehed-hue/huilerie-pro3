"""Shared helpers for season tests."""
import httpx
from filelock import FileLock

# Active season is global, shared app state. The suite runs under pytest-xdist
# (-n 2 --dist loadscope), so different test modules can execute truly
# concurrently on separate worker processes. Any test that flips the active
# season (or assumes it is stable mid-test) must hold this cross-process lock
# for its whole body to avoid racing other season-mutating tests.
SEASON_LOCK_PATH = "/tmp/tscheck_active_season.lock"


def season_lock() -> FileLock:
    return FileLock(SEASON_LOCK_PATH, timeout=60)


def login(client: httpx.Client, username: str, password: str):
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r


def set_active_season(client: httpx.Client, season: str):
    return client.put("/seasons/active", json={"season": season})


def get_seasons(client: httpx.Client):
    r = client.get("/seasons")
    assert r.status_code == 200, r.text
    return r.json()
