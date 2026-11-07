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
