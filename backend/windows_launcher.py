"""Small Windows desktop controller for the packaged Oro Verde backend."""
from __future__ import annotations

import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, simpledialog


APP_DIR = Path(sys.executable).resolve().parent
DATA_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "OroVerde"
BACKEND_EXE = APP_DIR / "backend" / "OroVerdeBackend.exe"
PORT = 8000
URL = f"http://127.0.0.1:{PORT}/"
API_HEALTH = f"http://127.0.0.1:{PORT}/api/"
LOG_DIR = DATA_DIR / "logs"
LOG_FILE = LOG_DIR / "backend.log"


def write_first_run_config(root: tk.Tk) -> bool:
    env_file = DATA_DIR / ".env"
    if env_file.exists():
        return True
    messagebox.showinfo(
        "First setup",
        "This is the first launch. Create the local administrator account. "
        "The password is stored only in the protected local Windows data directory.",
        parent=root,
    )
    username = simpledialog.askstring("Local administrator", "Choose an administrator username (at least 4 characters):", parent=root)
    if not username or len(username.strip()) < 4:
        return False
    password = simpledialog.askstring("Local administrator", "Choose a strong password (at least 16 characters):", show="*", parent=root)
    if not password or len(password) < 16:
        messagebox.showerror("Invalid password", "The password must contain at least 16 characters.", parent=root)
        return False
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    content = "\n".join([
        "APP_ENV=production",
        "SERVE_FRONTEND=true",
        "MONGO_URL=mongodb://127.0.0.1:27017/?replicaSet=rs0",
        "DB_NAME=oroverde_local",
        f"JWT_SECRET={secrets.token_urlsafe(48)}",
        "AUTH_DISABLED=false",
        "COOKIE_SECURE=false",
        "COOKIE_SAMESITE=lax",
        f"CORS_ORIGINS=http://127.0.0.1:{PORT},http://localhost:{PORT}",
        f"INITIAL_ADMIN_USERNAME={username.strip()}",
        f"INITIAL_ADMIN_PASSWORD={password}",
        "MONGODB_SERVICE_NAME=MongoDB",
        "",
    ])
    env_file.write_text(content, encoding="utf-8")
    return True


def mongodb_service_status() -> tuple[bool, str]:
    """Check the configured Windows MongoDB service before starting the backend."""
    env_file = DATA_DIR / ".env"
    service_name = "MongoDB"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("MONGODB_SERVICE_NAME="):
                service_name = line.split("=", 1)[1].strip() or service_name
                break
    try:
        result = subprocess.run(
            ["sc.exe", "query", service_name],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False, service_name
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        return False, service_name
    if "RUNNING" not in output.upper():
        return False, service_name
    return True, service_name


def backend_healthy() -> bool:
    try:
        with urllib.request.urlopen(API_HEALTH, timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def main() -> None:
    root = tk.Tk()
    root.title("Oro Verde")
    root.geometry("420x210")
    root.resizable(False, False)

    status = tk.StringVar(value="Preparing local application…")
    tk.Label(root, text="Oro Verde", font=("Segoe UI", 18, "bold")).pack(pady=(18, 4))
    tk.Label(root, textvariable=status, wraplength=380).pack(pady=8)

    process: subprocess.Popen | None = None

    def open_app() -> None:
        webbrowser.open(URL)

    def stop_app() -> None:
        nonlocal process
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        process = None
        root.destroy()

    def launch() -> None:
        nonlocal process
        if not BACKEND_EXE.is_file():
            messagebox.showerror("Installation incomplete", f"Backend executable not found:\n{BACKEND_EXE}", parent=root)
            root.destroy()
            return
        if not write_first_run_config(root):
            root.destroy()
            return
        mongo_running, mongo_service = mongodb_service_status()
        if not mongo_running:
            status.set(f"MongoDB service '{mongo_service}' is not running.")
            messagebox.showerror(
                "MongoDB is not ready",
                f"The Windows service '{mongo_service}' was not found or is not running.\\n\\n"
                "Install MongoDB Community Server, configure replica set rs0, and start the service. "
                "Then launch Oro Verde again.\\n\\n"
                "Do not use the web/Atlas database for this local installation.",
                parent=root,
            )
            root.destroy()
            return
        if backend_healthy():
            status.set("Oro Verde is already running on this computer.")
            open_button.configure(state="normal")
            return
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env["OROVERDE_APP_DIR"] = str(APP_DIR)
        env["OROVERDE_DATA_DIR"] = str(DATA_DIR)
        env["OROVERDE_PORT"] = str(PORT)
        with LOG_FILE.open("a", encoding="utf-8") as log:
            process = subprocess.Popen(
                [str(BACKEND_EXE)],
                cwd=str(APP_DIR),
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        status.set("Starting local database connection and application…")
        deadline = time.monotonic() + 90
        def poll_startup() -> None:
            if backend_healthy():
                # The initial credentials are only needed to seed the first admin.
                # Remove them from the persistent env file after successful bootstrap.
                env_file = DATA_DIR / ".env"
                if env_file.exists():
                    lines = env_file.read_text(encoding="utf-8").splitlines()
                    env_file.write_text(
                        "\n".join(
                            line for line in lines
                            if not line.startswith("INITIAL_ADMIN_USERNAME=")
                            and not line.startswith("INITIAL_ADMIN_PASSWORD=")
                        ) + "\n",
                        encoding="utf-8",
                    )
                status.set("Oro Verde is running on this computer.")
                open_button.configure(state="normal")
                return
            if process is None or process.poll() is not None:
                status.set(f"Startup failed. See log: {LOG_FILE}")
                messagebox.showerror("Could not start Oro Verde", f"Check MongoDB service and replica set rs0.\nThen inspect:\n{LOG_FILE}", parent=root)
                return
            if time.monotonic() >= deadline:
                status.set(f"Startup timed out. See log: {LOG_FILE}")
                messagebox.showerror("Startup timeout", f"The backend did not become ready.\nInspect:\n{LOG_FILE}", parent=root)
                return
            root.after(1000, poll_startup)
        root.after(1000, poll_startup)

    controls = tk.Frame(root)
    controls.pack(pady=14)
    open_button = tk.Button(controls, text="Open Oro Verde", width=18, state="disabled", command=open_app)
    open_button.pack(side="left", padx=6)
    tk.Button(controls, text="Stop and close", width=18, command=stop_app).pack(side="left", padx=6)
    root.protocol("WM_DELETE_WINDOW", stop_app)
    root.after(200, launch)
    root.mainloop()


if __name__ == "__main__":
    main()
