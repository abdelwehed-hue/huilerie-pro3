# Oro Verde Commercial Domain

This package is an isolated commercial domain. It must not change existing olive-press loads, reception numbering, or service invoices.

## Fixed scope decisions

- Finished-oil purchases are excluded from the first release.
- Commercial olive purchases and commercial production are distinct from customer-owned olive pressing services.
- Bulk sales only in the first release.
- Oil ownership supports mill-owned and customer-custody stock. Consignment sales and owner settlement are excluded until separately approved.
- Nine tanks are provisioned with zero opening balance.
- Tank capacities remain undefined; no capacity limits are enforced until explicitly configured.
- Quality analyses and independent release controls are required.
- All commercial document numbers use the four-digit season code, never the calendar year. Examples: `2627LOT0001`, `2627FAC0001`.
- Each document type has an independent sequence per season: LOT, MVT, ACH, PROD, VTE, FAC, PAY, INT, RET, AVO, CIN, CUS, CAP, and REV.
- Existing operational and service-invoice identifiers remain unchanged.

## Implementation rules

1. No commercial stock or financial posting from frontend calculations.
2. Every stock/financial posting is performed by a backend domain service.
3. Critical multi-document writes require MongoDB transaction support.
4. Idempotency and optimistic version checks protect retried/concurrent writes.
5. Posted documents and ledger events are immutable; corrections must use compensating records.
6. No production deployment until backup restoration, security configuration, and acceptance tests pass.

## Numbering and activation

- `services/numbering.py` formats numbers and atomically increments a pre-initialized counter using the caller's MongoDB transaction session.
- Critical unique indexes protect season/document counters, document identifiers, idempotency keys, and audit identifiers.
- Counter allocation deliberately does not upsert. A missing counter fails closed rather than silently creating an unexpected sequence.
- The active season comes from validated application settings; the client cannot choose a season for a new document.
- `POST /api/commercial/v1/bootstrap` is an explicit admin operation. It verifies replica-set/sharded transaction topology, creates critical indexes, provisions nine empty oil tanks, and initializes counters. It does not create opening stock and does not run automatically at startup.
- Production startup security checks require `APP_ENV=production`, `AUTH_DISABLED=false`, explicit non-wildcard `CORS_ORIGINS`, and secure initial admin credentials when the user collection is empty. Known demo credentials are rejected.

## Implemented backend workflows

### Master data and purchasing

- Separate commercial suppliers, olive varieties, receiving/staging locations, and wholesale buyers; legacy pressing customers and varieties are not silently reused.
- Olive purchase drafts validate supplier, registered varieties, Decimal quantities/prices, and idempotency. Totals are calculated server-side.
- Admin approval creates one olive LOT per purchase line and posts each receipt to a configured olive storage/staging location in one MongoDB transaction.
- Supplier, location, variety, and buyer creation are audited transactionally.

### Customer-owned custody

- Customer-owned olive intake is recorded as a CIN custody receipt, not a purchase. It creates a CUSTOMER-owned olive lot and posts the receipt to an olive storage location without creating supplier debt or mill-owned stock.
- The custody owner has a stable commercial owner ID linked to the legacy client phone; customer-owned stock never uses the phone itself as the ledger identity.
- Customer-owned oil pickup is recorded as a CUS custody release. It requires the matching owner ID, a released quality decision, a normal active tank, sufficient stock, and a customer acknowledgement reference.
- CIN/CUS documents, their MVT ledger entries, balances, and audit events commit atomically. Customer pickup is not a sale, creates no invoice, and does not change lot ownership.
- Customer-owned oil remains excluded from mill wholesale sale selectors and server-side sale dispatch validation.
- Customer-authorized transfer to MILL ownership, custody statements, owner payout, and consignment sales are not implemented.

### Production and inventory

- Production consumes actual olive quantities and records actual oil output; no fixed yield assumptions are used.
- A production run cannot mix MILL-owned and CUSTOMER-owned olive lots, including different customer owners.
- Olive consumption, production record, oil LOT creation, output receipt, and audit event commit atomically.
- Output oil begins with quality status PENDING.
- Stock ledger quantities use Decimal128 and reject negative balances. Movements are append-only and idempotent.
- Internal location transfers and ownership changes use a dedicated INT document. The INT document, MVT ledger entry, balance deltas, and audit event commit in one transaction.
- Generic public stock writes are blocked. Purchase receipts, production consumption/output, internal transfers, and wholesale dispatch can only be posted by their owning workflows.

### Quality and permissions

- Laboratory submission records sample metadata, specification reference, and measurements only; it cannot decide RELEASED or REJECTED.
- A separate reviewer command records the final quality decision. The service rejects self-approval, stale lot versions, superseded assessments, and repeat final decisions.
- Release/rejection, lot status, release record, and audit event commit in one transaction.
- Admins retain all commercial permissions. Workers are read-only by default; admins may assign narrowly scoped lab recording, quality release, and audit viewing permissions. Assignments are audited.
- Effective permissions are checked by the backend, not trusted from frontend role claims.

### Wholesale sales, invoices, and payments

- Wholesale buyer records are separate from legacy pressing clients.
- Admins can edit buyer profiles using optimistic version checks and can deactivate/reactivate buyers without deleting history. Each change is audited; inactive buyers remain visible for historical receivables but cannot be selected for new sales.
- Sale drafts receive season-scoped VTE numbers. Approval requires an active buyer, an open MILL-owned oil lot, a persisted RELEASED quality decision, an active source tank, and sufficient stock.
- Approved-sale return intake is recorded as a season-scoped RET document. It creates a new MILL-owned oil LOT with quality PENDING and receives it only into an explicitly designated QUARANTINE tank. The original sale's returned quantity is version-checked and cannot exceed the dispatched quantity. Commercial acceptance is a separate audited action that issues a season-scoped AVO credit note. The AVO amount is calculated from the returned quantity and the original frozen sale price; the original invoice gross amount and payment records remain immutable. Net receivable and buyer credit balance are adjusted transactionally. The APIs are `POST /api/commercial/v1/sales/{sale_id}/returns` and `POST /api/commercial/v1/sale-returns/{return_id}/accept`.
- Draft sales can be cancelled with a reason, optimistic version check, idempotency key, and audit event. Cancellation does not recycle the reserved VTE number and is forbidden after approval.
- Customer-custody oil and pending/rejected oil cannot be sold by the mill.
- Sale approval creates the commercial FAC invoice and DISPATCH MVT movement in the same MongoDB transaction.
- Payments receive season-scoped PAY numbers. Payment posting is idempotent, version-checked, and rejects overpayment. Partial/full payment status is maintained on the invoice.
- Bank transfers and cheques require a traceable reference; cash payments may omit it.
- The buyer account summary endpoint `GET /api/commercial/v1/buyers/{buyer_id}/account-summary` aggregates gross invoices, credit notes, net receivable, paid amount, outstanding amount, invoice counts by payment status, and buyer credit balance. It includes inactive buyers so historical receivables remain visible.
- Tax treatment is explicitly marked `NOT_CONFIGURED`. These records are internal commercial records and are not represented as legally compliant tax invoices.

## Frontend

- Bilingual Arabic/French commercial workspace at `/commercial`, including RTL support.
- Read-only dashboard, tank balances, lots/ownership, movement ledger, quality assessments, and audit views.
- Admin-only bootstrap, supplier/location/variety master data, olive purchase and approval, customer-owned olive custody intake and oil pickup, production, quality review, worker permission assignment, wholesale buyer maintenance, buyer account summaries with net receivable/credit balance, sales draft cancellation/approval, quarantine tank role management, approved-sale return intake and commercial acceptance/credit notes, invoice, and payment workflows.
- Worker visibility and write controls follow effective commercial permissions; the backend remains authoritative.
- Frontend forms do not authoritatively calculate stock or financial balances.

## Payment reversal API

- `POST /api/commercial/v1/sale-payments/{payment_id}/reversals` — admin-only partial or full REV against an original PAY document.
- `GET /api/commercial/v1/sales-invoices/{invoice_id}/payment-reversals` — read reversal history for an invoice.

REV is append-only. It never edits or deletes the original PAY. If the reversal reduces buyer credit created by an AVO on that same invoice, the service debits only still-available source credit; it blocks the reversal if that credit has already been applied elsewhere. The accounting reversal does not initiate a cash or bank refund.

## Buyer credit application API

- `POST /api/commercial/v1/sales-invoices/{invoice_id}/credit-applications` — admin-only non-cash application of available AVO buyer credit to an outstanding invoice.
- `GET /api/commercial/v1/sales-invoices/{invoice_id}/credit-applications` — read the target invoice's CAP history.

CAP allocates available credit FIFO across issued credit notes for the same buyer. Each source allocation is appended to the buyer credit ledger, the buyer credit balance and target invoice outstanding are updated in one MongoDB transaction, and the invoice cash-paid amount and PAY records remain unchanged. Payment reversal and cash refunds are not enabled.

## Customer custody API

- `POST /api/commercial/v1/customer-custody/receipts` — admin-only CIN intake of customer-owned olives.
- `GET /api/commercial/v1/customer-custody/receipts?customer_id={id}` — read receipt history by stable owner ID.
- `POST /api/commercial/v1/customer-custody/releases` — admin-only CUS pickup of customer-owned, quality-released oil.
- `GET /api/commercial/v1/customer-custody/releases?customer_id={id}` — read pickup history by stable owner ID.
- `GET /api/commercial/v1/customer-custody/owners` — read stable owner IDs linked to legacy clients.
- `GET /api/commercial/v1/customer-custody/owners/{customer_id}/statement` — read the reconciled customer-owned olive/oil ledger and current balances.

CIN and CUS each have their own season-scoped counter and each stock posting creates a separate MVT number. Neither endpoint creates a purchase, sale, invoice, supplier payable, or buyer receivable.

## Validation

- GitHub Actions validates backend syntax, commercial unit tests, legacy invoice regression tests, frontend production build, and MongoDB replica-set transaction integration.
- The last fully green CI run was `41521851252` at commit `8a651bf0dfd6c0d415942eb2df460f8dee569a7b`; it passed invoice unit tests, commercial unit tests, MongoDB replica-set transaction integration, frontend production build, and backend syntax.
- Subsequent CAP, REV, buyer-credit reconciliation, and custody UI changes are not yet release-validated. CI exposed a stale source-document assertion and frontend typing issues; those code/test fixes have been committed. The latest GitHub Actions attempts on the current feature head failed within seconds without producing downloadable job logs, so a clean rerun is required before merge.
- The feature branch includes buyer lifecycle, draft sale cancellation, tank quarantine controls, atomic physical sale return intake, concurrent over-return protection, AVO credit notes, CAP credit application, REV payment reversal, buyer account summaries, and bilingual commercial workflows.

## Not yet implemented / blockers before operational release

- Controlled buyer duplicate/merge process.
- Cash refund. Non-cash buyer-credit application (CAP), immutable payment reversal (REV), and rejected-return re-dispatch (RJT) are implemented; cash refunds remain disabled until bank/cash reconciliation and approval controls are implemented. Existing PAY records are never edited or deleted. Tax treatment remains `NOT_CONFIGURED`. See [PAYMENT_ADJUSTMENTS_DESIGN.md](./PAYMENT_ADJUSTMENTS_DESIGN.md) and [RETURNS_DESIGN.md](./RETURNS_DESIGN.md).
- Authorized ownership transfer and owner payout/consignment accounting. Implemented CIN intake and CUS pickup are documented in [CUSTOMER_CUSTODY_DESIGN.md](./CUSTOMER_CUSTODY_DESIGN.md).
- Approved quality-specification catalog and governed tax configuration/invoice templates.
- End-to-end browser acceptance on desktop and mobile, backup/restore rehearsal, production environment configuration, and controlled rollout.

## Production safety status

PR #147 remains Draft and unmerged. No Render deployment, live commercial bootstrap, production migration, or live stock/financial posting has been performed. Do not merge or deploy until the remaining blockers and acceptance checks are closed.
