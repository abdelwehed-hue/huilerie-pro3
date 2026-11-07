# Build from the backend directory:
#   python -m PyInstaller --clean --noconfirm OroVerdeBackend.spec
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

backend_dir = Path(SPECPATH).resolve()
font_dir = backend_dir / "fonts"

hiddenimports = []
production_module = lambda name: ".tests" not in name and not name.endswith("_test")
for package in ("commercial", "lib", "models", "routers"):
    hiddenimports += collect_submodules(package, filter=production_module)
hiddenimports += collect_submodules("uvicorn")

a = Analysis(
    ["windows_entry.py"],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[(str(font_dir), "fonts")],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "black", "flake8", "mypy"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="OroVerdeBackend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="OroVerdeBackend",
)
