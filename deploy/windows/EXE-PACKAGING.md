# Oro Verde Windows EXE packaging plan

## Goal

Produce a Windows installer named `OroVerde-Setup.exe` that installs a desktop shortcut and launches the local Oro Verde application without requiring the operator to run PowerShell commands.

This is a packaging plan, not a claim that a tested installer already exists.

## Non-negotiable isolation and data safety

- Keep this work on `feature/windows-exe-packaging`.
- Do not merge to `main` or deploy to Render as part of packaging.
- Keep the Windows database named `oroverde_local`, with a localhost-only MongoDB connection.
- Never reuse a Render/Atlas connection string or copy web data into the local database.
- Keep `.env`, MongoDB data, logs, uploads, and backups in a writable data directory outside the installed application directory (for example, under `%ProgramData%\OroVerde\`).
- Upgrades and uninstall must preserve local database files and backups by default. Data deletion must be a separate, explicit operation.
- Bind the first release to `127.0.0.1` only. LAN/mobile access is out of scope until HTTPS, secure cookies, and firewall controls are implemented and tested.

## Packaging architecture

1. Build the React/Vite frontend into `frontend/dist`.
2. Package the FastAPI backend as a PyInstaller **onedir** bundle first. Avoid one-file mode initially because native Python dependencies and runtime data files are easier to diagnose in an onedir layout.
3. Preserve the backend module layout and explicitly include runtime assets (including PDF fonts and any templates/static files discovered during the packaging audit).
4. Add a small Windows launcher that starts the packaged backend hidden, waits for the local health endpoint, opens the default browser, and shuts down only the backend process it started.
5. Build `OroVerde-Setup.exe` with an installer tool such as Inno Setup. The installer creates shortcuts and application directories but does not silently delete or overwrite the database.
6. Treat MongoDB Community Server, MongoDB Shell, and MongoDB Database Tools as separately installed prerequisites in the first release. Detect missing prerequisites and show actionable setup instructions; do not bundle or redistribute MongoDB until licensing and service-install behavior have been reviewed.

## Required audit before implementation

- Identify every runtime file read or written relative to `__file__` or the current working directory.
- Identify PDF fonts, report templates, upload/media directories, and any other non-Python assets.
- Verify PyInstaller hidden imports for FastAPI, Uvicorn, Motor/PyMongo, ReportLab, Arabic reshaping/BiDi, and the application's routers.
- Verify that the frozen backend reads its private configuration from the external data directory, not from the read-only install directory.
- Verify startup, health checks, browser launch, process shutdown, logging, and recovery after an unclean exit.

## Release gates

A distributable installer is not considered ready until all of these pass on a real Windows 11 machine:

- Clean installation and first-run configuration.
- MongoDB replica-set readiness and empty `oroverde_local` initialization.
- Administrator login and session-cookie behavior.
- Direct navigation and refresh on major app routes.
- PDF generation including Arabic text and embedded fonts.
- Upload/media persistence (if used by the application).
- Restart, Windows reboot, and process shutdown behavior.
- Backup creation and an actual restore into a separate verification database.
- Upgrade over an existing installation without loss of `.env`, database, uploads, or backups.
- Uninstall that preserves user data by default.

A successful GitHub Actions build or a PowerShell syntax check is not a substitute for these Windows 11 runtime tests.
