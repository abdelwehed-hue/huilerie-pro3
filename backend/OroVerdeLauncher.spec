# Build from backend directory after the backend bundle:
# python -m PyInstaller --clean --noconfirm OroVerdeLauncher.spec
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

backend_dir = Path(SPECPATH).resolve()
a = Analysis(
    ["windows_launcher.py"],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[],
    hiddenimports=collect_submodules("tkinter"),
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
    a.binaries,
    a.datas,
    [],
    name="OroVerde",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)
