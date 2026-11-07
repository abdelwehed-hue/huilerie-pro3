# Oro Verde — Windows local deployment (work in progress)

This setup targets one Windows 11 PC at the mill. It serves the app on that PC. Worker-phone access is a separate later phase requiring HTTPS and LAN security.

## Isolation guarantee

- Windows uses a new local MongoDB replica set and database: `oroverde_local`.
- Never copy the Render/Atlas connection string into `backend/.env`.
- No synchronization is implemented. Local and web data remain separate.
- Do not merge this branch to `main` or deploy it to Render as part of local setup.

## One-time setup

Install Python 3.11+, Node.js LTS, MongoDB Community Server, MongoDB Shell, and MongoDB Database Tools (`mongodump`/`mongorestore`). Start the MongoDB Windows service. The application uses MongoDB transactions; standalone MongoDB is insufficient.

From the repository root:

1. Copy `deploy/windows/backend.env.example` to `backend/.env`.
2. Edit `backend/.env`: set a random JWT secret (32+ characters), a unique first-admin username, and a unique password (16+ characters). Keep `APP_ENV=production`, `AUTH_DISABLED=false`, `SERVE_FRONTEND=true`, local Mongo URL, and `DB_NAME=oroverde_local`. Never use Atlas credentials.
3. Initialize the single-node local replica set once:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Initialize-LocalReplicaSet.ps1
   ```

   Wait for MongoDB to elect a PRIMARY. Then verify it:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Test-LocalRuntime.ps1
   ```

4. Install backend dependencies:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Setup-Backend.ps1
   ```

5. Build the frontend:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Build-LocalFrontend.ps1
   ```

6. Start the application:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Start-OroVerde.ps1
   ```

The launcher validates local-only configuration and MongoDB rs0 PRIMARY status, starts FastAPI, waits for `/api/` health, and opens the browser. On an empty database, the first admin is seeded from `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`. Production mode prevents creation of known demo accounts. Keep the initial-admin credentials in the private, uncommitted `backend/.env`: the current bootstrap needs them whenever the database is empty. Restrict access to this file and never share or commit it.

7. Install the desktop shortcut:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Install-DesktopShortcut.ps1
   ```

The shortcut manually launches the local app. To stop it, run `deploy\windows\Stop-OroVerde.ps1`. MongoDB is a separate Windows service and is not stopped by the app shortcut.

## Local database backup and restore

Stop Oro Verde first, then create a compressed backup regularly; this prevents application writes during the dump. Store a second copy on a separate encrypted drive:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Backup-LocalDatabase.ps1
```

The script writes a timestamped MongoDB archive and SHA-256 checksum under `backups/`. Keep both files. To restore, keep Oro Verde stopped and select a known-good archive. The restore script refuses to run while anything is listening on port 8000 (or the alternate port supplied with `-Port`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Restore-LocalDatabase.ps1 -Archive .\backups\oroverde_local-YYYYMMDD-HHMMSS.archive.gz
```

By default restore does not drop existing collections. For an exact replacement, use `-DropTarget`; this prompts for the literal confirmation `RESTORE-OROVERDE-LOCAL` and replaces matching target collections. Never use that option without a separate verified backup. A restore is not proven until you restart the app and inspect important records.

## LAN and security

- The initial launcher binds to `127.0.0.1:8000` only. This intentionally limits the first stage to the Windows PC; worker phones cannot connect yet.
- The sample uses `COOKIE_SECURE=false` and `COOKIE_SAMESITE=lax` solely for localhost HTTP bootstrap. Do not use this cookie profile over Wi-Fi/LAN or the internet.
- Before enabling worker phones, configure local HTTPS, change to `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none`, verify certificate trust on every device, then implement and test a restricted Windows Private-profile firewall rule. This work is not included yet.
- Frontend API calls use relative `/api` paths and the WebSocket derives from the page host. Authentication remains required.

## Not yet approved for live mill operations

This work has not been executed on Windows. Test localhost login/session behavior, WebSocket reconnects, core workflows, restart persistence, and backup/restore. Before worker-phone access, configure local HTTPS and secure cookies, then test from actual devices. Make a backup and prove restore before entering real transactions.

The scripts do not install MongoDB, configure firewall rules, provide local HTTPS, or implement backup/restore scheduling. Offline synchronization with Render/Atlas does not exist. The local database is independent and starts empty.
