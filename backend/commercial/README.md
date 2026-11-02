# Oro Verde Commercial Domain

This package is a new, isolated domain. It must not change existing olive-press
loads, reception numbering, or service invoices.

## Fixed scope decisions

- Finished-oil purchases are excluded from the first release.
- Commercial olive purchases and commercial production are distinct from
  customer-owned olive pressing services.
- Bulk sales only in the first release.
- Oil ownership supports mill-owned and custody/consignment stock.
- Nine tanks are provisioned with zero opening balance.
- Tank capacities remain undefined until explicitly configured.
- Quality analyses and release controls are required.
- All commercial document numbers use the four-digit season code, never the
  calendar year. Examples: `2627LOT0001`, `2627FAC0001`.
- Each document type has an independent sequence per season: LOT, MVT, ACH, PROD, VTE, FAC, and PAY.
- Existing operational and service-invoice identifiers remain unchanged.

## Implementation rules

1. No commercial stock or financial posting from frontend calculations.
2. Every stock/financial posting is performed by a backend service.
3. Critical multi-document writes require MongoDB transaction support.
4. Idempotency and optimistic version checks protect retried/concurrent writes.
5. Corrections use reversal/correction records; posted documents are immutable.
6. No production deployment until backup restoration and acceptance tests pass.

## Numbering

- `services/numbering.py` formats numbers and atomically increments a
  pre-initialized counter using the caller's MongoDB transaction session.
- `bootstrap.py` creates the unique `(season_code, document_type)` index and
  initializes missing counters for explicitly configured seasons.
- Counter allocation deliberately does not upsert. A missing counter fails
  closed rather than silently creating an unexpected sequence.
- The active season must come from validated season configuration; the
  four-digit formatter alone does not decide which season is active.


## Current implemented foundation

- schemas/purchases.py validates olive purchase drafts using Decimal quantities and DT/kg prices; totals are never accepted from clients.
- services/purchases.py creates a DRAFT olive purchase with an ACH season number, supplier validation, idempotency fingerprint, Decimal128 line values, and audit event. The caller must supply an active MongoDB transaction session.
- services/purchase_approval.py approves a draft with an expected-version check, creates one LOT per variety line, and posts each olive receipt to an explicitly configured olive storage/staging location in the same transaction.
- Oil tanks and olive staging locations are distinct. Olive intake cannot be silently placed in one of the nine oil tanks.
- services/reference_validation.py recognizes ACH and PROD as registered source document types. A movement is rejected unless its source document is approved/completed and its lot and location references exist.
- permissions.py keeps legacy worker access read-only by default. An administrator can explicitly assign a worker `commercial.lab_record` or `commercial.quality_release`; purchase, production, sales, stock, and payment writes remain admin-only.

## Not yet implemented

- Frontend screens and user workflows.
- Purchase cancellation/reversal after approval.
- Bulk sales, payments, and customer-custody settlement.
- Quality specification catalog and approval policy catalog.
- End-to-end transaction tests against a MongoDB replica set.

A service function that accepts a MongoDB session is not by itself proof of transaction safety: its caller must wrap the full command in run_transaction, and this integration still requires replica-set tests.


## API and activation

- Authenticated commercial API routes are mounted under `/api/commercial/v1`.
- `POST /api/commercial/v1/bootstrap` is an explicit admin operation; it checks transaction-capable MongoDB topology, creates critical indexes, provisions nine empty oil tanks, and initializes active-season counters.
- Public-auth mode (`AUTH_DISABLED=true`) is rejected for all commercial endpoints.
- Write endpoints read the active season from existing application settings and fail closed until its counters and tanks are provisioned.
- Supplier and olive receiving/staging location APIs are available. Commercial purchase, production, and quality commands are wrapped by the existing `run_transaction` helper.
- Read APIs expose tanks, locations, suppliers, buyers, lots, stock balances, purchases, production runs, quality assessments, wholesale sales, invoices, and payment history.


## Quality separation of duties

- Laboratory submission uses `POST /api/commercial/v1/quality-assessments` and requires `commercial.lab_record`.
- Submission stores measurements and a specification reference only. It cannot set `RELEASED` or `REJECTED`; the oil lot remains unavailable for sale.
- Independent review uses `POST /api/commercial/v1/quality-assessments/release` and requires `commercial.quality_release`.
- The service rejects self-approval, stale lot versions, superseded assessments, and repeat final decisions. Release/rejection, lot status, release record, and audit event commit in one MongoDB transaction.
- Admins retain all commercial permissions. Workers receive no commercial write permission by default. An admin assigns only scoped laboratory/reviewer permissions through `POST /api/commercial/v1/users/{user_id}/commercial-permissions`; assignments are audited.
- The reviewer must be a different user ID from the laboratory submitter. This is enforced server-side, not merely by hiding a button in the UI.


## Internal stock movements

- Internal location transfers and ownership changes use a dedicated `INT` document collection. The INT document, MVT ledger entry, balance deltas, and audit event commit in one transaction.
- A location transfer must preserve the same owner and change location. An ownership transfer must preserve location and change owner.
- The public generic stock-write endpoint is closed. Purchase receipts, production consumption/output, internal transfers, and wholesale dispatch are posted only by their owning domain services.

## Wholesale sales and payments

- Wholesale buyer records are separate from legacy pressing clients; no automatic identity mapping is assumed.
- A sale draft receives a season-scoped `VTE` number. Approval requires an open oil lot owned by the mill, a persisted RELEASED quality decision, an active source tank, and sufficient stock.
- Approval creates a `FAC` commercial invoice and a `DISPATCH` MVT movement in the same MongoDB transaction. Customer-custody oil and pending/rejected oil cannot be sold.
- Payments receive season-scoped `PAY` numbers. Payment posting is idempotent, version-checked, and rejects amounts greater than the outstanding invoice balance. Partial and full payment states are maintained on the invoice. Bank transfers and cheques require a traceable reference; cash payments may omit it.
- Tax treatment is explicitly marked `NOT_CONFIGURED`; these records are not represented as legally compliant tax invoices. Configure and validate the applicable tax rules and invoice format before operational tax invoicing.
- Sale correction, cancellation, return, dispatch reversal, buyer deactivation, and tax configuration are not yet implemented. Approved sales and payments must not be edited directly in MongoDB.
