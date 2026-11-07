# Oro Verde — Windows local deployment (work in progress)

This setup is intended for a **single Windows 11 mill server** with worker phones connected to the same trusted Wi-Fi/LAN.

## Isolation guarantee

- The Windows instance must use its own MongoDB database (for example, `oroverde_local`).
- Do not copy the Render/Atlas connection string into the Windows environment.
- This branch does not implement data synchronization. Local and web data remain separate.
- Do not merge this work to `main` or deploy it to Render as part of local setup.

## Planned runtime

1. MongoDB Community running locally on Windows, configured as a single-node replica set if the application’s transaction paths require it.
2. FastAPI backend bound to the mill LAN interface (not exposed to the public internet).
3. Frontend built with a local API origin; do not rely on the Render fallback for a LAN deployment.
4. Windows Firewall allows the required application port only on the Private network profile.
5. A manually launched desktop shortcut starts the local services and opens the local app. No auto-start is intended.

## Before enabling real operations

- Confirm MongoDB transaction compatibility and configure/verify the replica set.
- Set a unique JWT secret and a non-default administrator password.
- Set the exact LAN origin(s) in CORS configuration. Avoid wildcard origins when cookies are used.
- Confirm cookie behavior from phone browsers over the local HTTP network; if browser policy requires secure cookies, use local HTTPS.
- Verify the WebSocket address is derived from the local API origin.
- Take a database backup and test restore.
- Test login, create/read/update workflows, restart persistence, and access from at least one worker phone.

## Not yet complete

This document is a deployment plan, not a validated installer. The Windows launcher, local database service setup, local HTTPS decision, and end-to-end tests are still pending. Do not use this as a production operating procedure yet.

## Local environment safety check

Copy `deploy/windows/backend.env.example` to `backend/.env` on the Windows PC, then replace the placeholders. Keep this file out of Git and do not paste Atlas credentials into it.

Before launching the backend, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-LocalConfig.ps1 -EnvPath .\backend\.env
```

The check rejects remote/Atlas MongoDB URLs, a database name other than `oroverde_local`, weak placeholder JWT secrets, disabled authentication, and wildcard CORS. It is a configuration guard only; it does not start services or prove replica-set, LAN, cookie, or WebSocket readiness.

**Important:** the backend's non-production seed path currently creates demo accounts (`admin/admin123` and `ouvrier/ouvrier123`) when the users collection is empty. Rotate/remove these before real mill operations; the eventual Windows installer/launcher must not silently rely on demo credentials. The local deployment still needs a reviewed provisioning flow for its first administrator.

## Frontend API and realtime behavior (reviewed)

The frontend builds its HTTP API base from `VITE_API_ORIGIN` and derives its realtime WebSocket endpoint from that same origin (`http(s)` → `ws(s)`, then `/api/realtime`). Thus the local frontend build must set `VITE_API_ORIGIN` to the local backend origin; otherwise the existing Render fallback remains in effect. This build-time setting is not a live runtime switch.

The existing Vite dev server uses port 3000 and its development proxy points to backend port 8001. That proxy is a developer setup, not yet a packaged Windows deployment. A production-style local install still needs a reviewed way to serve the compiled frontend and route API/WebSocket traffic on one stable LAN origin (or explicitly configure the LAN frontend origin in CORS).

For first-time local provisioning, the backend's current non-production seeding behavior creates known demo credentials. This is not acceptable as the final mill-PC onboarding flow. The eventual launcher/setup must provide an explicit admin-password setup step and must keep `AUTH_DISABLED=false`.

### Current implementation status

- Configuration sample and fail-fast configuration validation: added.
- Local MongoDB replica-set setup/health verification: not yet automated.
- Production frontend build served locally: not yet configured.
- Windows start/stop launcher and desktop shortcut: not yet added.
- LAN phone login, cookie behavior, and WebSocket reconnect test: not yet performed.
- Local backup/restore and offline sync to Render: not implemented; do not assume synchronization.


## Read-only Windows runtime preflight

After installing Python, Node.js LTS, MongoDB Community (configured as replica set `rs0`), and MongoDB Shell, run this from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\deploy\\windows\\Test-LocalRuntime.ps1
```

The preflight re-runs the local isolation/secret checks, verifies the required command-line tools are on `PATH`, and asks `mongosh` whether the local `rs0` replica set has an elected PRIMARY. It is read-only: it does not install packages, initialize or modify MongoDB, start the backend, or launch the frontend. A failure gives the missing prerequisite; it is not a substitute for the remaining application and LAN acceptance tests.


## Same-origin local frontend build (implemented; not yet Windows-tested)

The local runtime can now serve the compiled React frontend from FastAPI on the same origin as the API. This avoids a separate Vite development server and prevents the local browser build from silently falling back to Render:

1. From the repository root on Windows, run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\\deploy\\windows\\Build-LocalFrontend.ps1
   ```

   The script uses `npm ci` and builds with `VITE_API_SAME_ORIGIN=true`. The resulting frontend uses relative `/api` requests and a WebSocket derived from the page's own host. It deliberately unsets `VITE_API_ORIGIN` for this build.
2. Set `SERVE_FRONTEND=true` in `backend/.env` (the Windows sample now includes it).
3. Start FastAPI from the backend directory on the chosen local port (the planned default is 8000). FastAPI serves `frontend/dist` at `/` only when `SERVE_FRONTEND=true`; the option is off by default and therefore does not change Render's existing frontend hosting.
4. Open the local server address in a browser. The authenticated WebSocket accepts the exact same-origin host for this opt-in local mode; authentication remains required.

This is a deployment building block, not a complete installer: MongoDB service installation/replica-set initialization, first-admin provisioning, backend virtual-environment setup, firewall rules, launcher/desktop shortcut, backup/restore, and LAN acceptance tests remain outstanding. Do not use for live mill operations until those checks pass.
