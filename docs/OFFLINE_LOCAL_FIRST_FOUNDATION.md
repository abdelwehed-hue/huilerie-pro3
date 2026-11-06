# Offline local-first deployment foundation (huilerie-pro3)

## Status

Planning/foundation only. This document does not change production behavior, the Render deployment, or MongoDB Atlas data.

## Current repository facts

- Backend: FastAPI, async Motor client, MongoDB.
- Backend DB connection is created in `backend/lib/db.py` from `MONGO_URL` and `DB_NAME`.
- Backend startup currently runs index setup, default seeding, season-ID migration, and a reminder loop in `backend/server.py`.
- Frontend API calls are centralized in `frontend/src/lib/api.ts`, but `API_ORIGIN` currently points directly to a Render URL.
- The frontend uses HTTP-only cookie authentication; `frontend/src/lib/session.ts` calls the cloud API for logout.
- Existing WebSocket updates in `/api/realtime` are process-local notifications, not durable replication.
- There are existing transactional operations in the codebase. Local MongoDB must therefore be tested/configured appropriately before moving any transaction-dependent workflow.

## Target topology

- Windows 11 mill computer: local FastAPI + local MongoDB + durable sync worker/outbox.
- Phones and other computers on mill Wi-Fi/LAN: connect to the Windows server only.
- Render + MongoDB Atlas: cloud copy and remote access when online.
- Cloud and local must not independently accept conflicting inventory/production/sales writes while disconnected. Define an explicit operating mode/authority and reconcile only through durable events.

## Design constraints (must not be weakened)

1. Preserve the existing Atlas database; no destructive reset, rename, or migration as part of this foundation.
2. Do not let browser/mobile clients connect directly to MongoDB.
3. Every sync event needs a stable event ID, entity ID, origin node, schema version, timestamp, and idempotency handling.
4. A retry must not duplicate a purchase, production, sale, payment, invoice, tank movement, or traceability code.
5. Preserve the single GS traceability code across the entire lifecycle. Local/offline numbering must be collision-safe; do not simply increment an independently copied counter on both servers.
6. Stock/FIFO, quality decisions, invoice numbering, and monetary ledger events require explicit conflict rules—not blind last-write-wins.
7. Keep sensitive secrets out of source control. Bind the local service to LAN access, apply Windows Firewall restrictions, and use authenticated users.
8. Backups and restore drills are required before enabling write-capable synchronization.

## Implementation phases

### Phase 0 — audit (Mac; no production writes)
- Inspect routes and data models for every mutation.
- Identify counters/number generators, transaction boundaries, attachments/PDF storage, authentication/session assumptions, and existing backups.
- Map entities and dependencies; classify immutable events versus editable master data.
- Capture current Atlas database name, collections, indexes, and a verified backup through the user's own authorized environment.

### Phase 1 — local endpoint configuration
- Replace the frontend's hardcoded API origin with a validated runtime/build configuration.
- Keep the existing Render origin as the default for current production.
- Add a documented local origin option; do not silently switch production clients.
- Verify cookies, CORS, WebSocket URL, session expiry, and mobile browser behavior against LAN HTTP/HTTPS.

### Phase 2 — durable event/outbox groundwork
- Introduce a sync-event envelope and idempotency index.
- Create local outbox records atomically with the business write where supported.
- Add cloud ingestion that records processed event IDs and rejects duplicates.
- Add retry/backoff, status visibility, and dead-letter/manual-review handling.
- Do not sync by dumping/replacing whole collections.

### Phase 3 — controlled synchronization
- Establish the authoritative writer policy for local vs cloud.
- Sync in dependency order; preserve audit history.
- Use conflict queues for critical entities and never auto-resolve stock/financial conflicts with last-write-wins.
- Design safe, coordinated numbering for GS codes and invoices before offline issuance.

### Phase 4 — Windows installation and acceptance
- Install the local service and MongoDB with transaction support if required by audited workflows.
- Reserve a stable LAN address; restrict Windows Firewall to the mill network.
- Test outage, reconnection, duplicate delivery, partial failure, restart, clock drift, backups, restore, and concurrent cloud/local activity.
- Enable production use only after reconciliation tests pass.

## Immediate next work

Audit the actual code paths before writing sync mutations. First implementation should be a non-breaking configurable API origin, followed by sync event contracts and tests. No Render deployment or Atlas write is authorized by this document.
