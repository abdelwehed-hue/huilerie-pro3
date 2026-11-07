"""PyInstaller entry point for the local Windows FastAPI server."""
import os

import uvicorn

from server import app


def main() -> None:
    port = int(os.environ.get("OROVERDE_PORT", "8000"))
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    main()
