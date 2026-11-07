import importlib


def test_windows_paths_default_to_source_layout(monkeypatch):
    monkeypatch.delenv("OROVERDE_APP_DIR", raising=False)
    monkeypatch.delenv("OROVERDE_DATA_DIR", raising=False)

    import lib.paths as paths

    paths = importlib.reload(paths)
    assert paths.BACKEND_DIR.name == "backend"
    assert paths.APP_DIR == paths.BACKEND_DIR.parent
    assert paths.DATA_DIR == paths.BACKEND_DIR
    assert paths.ENV_FILE == paths.BACKEND_DIR / ".env"
    assert paths.FRONTEND_DIST_DIR == paths.APP_DIR / "frontend" / "dist"


def test_windows_paths_allow_external_install_and_data_dirs(monkeypatch, tmp_path):
    app_dir = tmp_path / "installed-app"
    data_dir = tmp_path / "machine-data"
    monkeypatch.setenv("OROVERDE_APP_DIR", str(app_dir))
    monkeypatch.setenv("OROVERDE_DATA_DIR", str(data_dir))

    import lib.paths as paths

    paths = importlib.reload(paths)
    assert paths.APP_DIR == app_dir
    assert paths.DATA_DIR == data_dir
    assert paths.ENV_FILE == data_dir / ".env"
    assert paths.FRONTEND_DIST_DIR == app_dir / "frontend" / "dist"
