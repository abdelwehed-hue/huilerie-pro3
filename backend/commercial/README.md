# Oro Verde Commercial Domain

This package is an isolated commercial domain. It must not change existing olive-press loads, reception numbering, or service invoices.

## Fixed scope decisions

- Finished-oil purchases are excluded from the first release.
- Commercial olive purchases and commercial production are distinct from customer-owned olive pressing services.
- Bulk sales only in the first release.
- Oil ownership supports mill-owned and customer-custody/consignment stock.
- Nine tanks are provisioned with zero opening balance.
- Tank capacities remain undefined; no capacity limits are enforced until explicitly configured.
- Quality analyses and independent release controls are required.
- All commercial document numbers use the four-digit season code, never the calendar year. Examples: `2627LOT0001`, `2627FAC0001`.
- Each document type has an independent sequence per season: LOT, MVT, ACH, PROD, VTE, FAC, PAY, INT, RET, and AVO.
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
- Admin-only bootstrap, supplier/location/variety master data, olive purchase and approval, production, quality review, worker permission assignment, wholesale buyer maintenance, buyer account summaries with net receivable/credit balance, sales draft cancellation/approval, quarantine tank role management, approved-sale return intake and commercial acceptance/credit notes, invoice, and payment workflows.
- Worker visibility and write controls follow effective commercial permissions; the backend remains authoritative.
- Frontend forms do not authoritatively calculate stock or financial balances.

## Validation

- GitHub Actions validates backend syntax, commercial unit tests, legacy invoice regression tests, frontend production build, and MongoDB replica-set transaction integration.
- Full CI run `41520098188` on commit `1b3fa7d61235a48deb0b05a81affbac902884d20` passed all five jobs: invoice unit tests, commercial unit tests, MongoDB replica-set transaction integration, frontend production build, and backend syntax.
- The validated head includes buyer lifecycle, draft sale cancellation, tank quarantine controls, physical sale return intake, AVO credit notes, net receivable/buyer-credit accounting, and the Arabic/French return workflow UI.
- A passing CI run does not replace browser-based operational acceptance, backup restoration verification, or production security configuration review.

## Not yet implemented / blockers before operational release

- Controlled buyer duplicate/merge process.
- Cash refund, buyer-credit application/settlement, return rejection and outbound re-dispatch. Credit-note issuance and buyer credit-balance accrual are implemented; tax treatment remains `NOT_CONFIGURED`. The proposed invariants and remaining design requirements are documented in [RETURNS_DESIGN.md](./RETURNS_DESIGN.md).
- Payment reversal/refund and reconciliation workflow. Existing payments must not be edited or deleted.
- Customer-custody oil settlement and owner payout accounting.
- Approved quality-specification catalog and governed tax configuration/invoice templates.
- End-to-end browser acceptance on desktop and mobile, backup/restore rehearsal, production environment configuration, and controlled rollout.

## Production safety status

PR #147 remains Draft and unmerged. No Render deployment, live commercial bootstrap, production migration, or live stock/financial posting has been performed. Do not merge or deploy until the remaining blockers and acceptance checks are closed.
