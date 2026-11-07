"""Filesystem locations for source and frozen Windows deployments.

The installer sets OROVERDE_APP_DIR to the read-only application root and
OROVERDE_DATA_DIR to the writable machine data directory. Source deployments
retain the existing repository layout when these variables are not set.
"""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_DIR = Path(os.environ.get("OROVERDE_APP_DIR", BACKEND_DIR.parent)).resolve()
DATA_DIR = Path(os.environ.get("OROVERDE_DATA_DIR", BACKEND_DIR)).resolve()
FRONTEND_DIST_DIR = APP_DIR / "frontend" / "dist"
ENV_FILE = DATA_DIR / ".env"
