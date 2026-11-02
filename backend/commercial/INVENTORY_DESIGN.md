# Commercial Inventory Ledger — Design Contract

This document defines the invariants for the first commercial inventory implementation.
It is a design contract, not a claim that inventory posting is already implemented.

## 1. Scope

- Inventory is separate from olive-press service loads and their customer invoices.
- Finished-oil purchases are excluded from this release.
- Commercial olive purchases, production, oil lots, quality release, tank movements,
  bulk sales, and customer-custody oil are in scope.
- There are nine oil tanks. All start at zero. Tank capacity is intentionally
  undefined; do not invent capacity values or reject a movement based on capacity.
- Stock quantities are stored as Decimal128-compatible decimal values in kilograms.
  Never use binary floating-point arithmetic for posted quantities or money.

## 2. Ownership is part of the stock identity

Every posted balance is partitioned by all of:
- product kind (OLIVE or OIL),
- lot identifier,
- owner kind (MILL or CUSTOMER),
- owner identifier (required for CUSTOMER; fixed mill identifier for MILL),
- storage location (one of the nine tanks for bulk oil; an explicitly configured
  non-tank location for olives or other approved staging).

A customer-custody lot is not mill-owned stock and must never be included in
available-to-sell mill stock. Transfers between tanks preserve owner and lot.
Changing ownership is not a tank transfer: it requires a separately authorized
ownership-transfer event with a source, destination, reason, and audit record.

## 3. Append-only movement ledger

The commercial_stock_movements collection is the authoritative record. Posted
movements are immutable: no edit or delete endpoint is permitted.

A movement records:
- immutable movement ID and season-scoped document/reference number,
- movement kind and posting state,
- product kind, lot ID, owner kind and owner ID,
- quantity in kg as a positive decimal,
- source location and destination location (one side may be null for receipt,
  consumption, or dispatch),
- source document type and ID,
- idempotency key,
- actor ID, UTC timestamp, reason, and optional correction/reversal reference.

Corrections are new compensating movements referencing the original movement.
A posted movement is never silently rewritten.

## 4. Balance projection

The commercial_stock_balances collection is a rebuildable projection, not the
source of truth. Its unique key is (product_kind, lot_id, owner_kind, owner_id,
location_id).

For each movement, update the source and destination balances in the same MongoDB
transaction as inserting the immutable ledger row and updating the source document.
A transfer debits one location and credits another for the same lot and owner.
A receipt credits a location; consumption or dispatch debits a location.

Reject a posting if any resulting balance would be negative. Never repair a
negative balance by clamping it to zero.

## 5. Transaction and concurrency rules

- Every stock-affecting command runs in a MongoDB transaction.
- The transaction includes: idempotency claim, source-document state transition,
  movement insertion, balance projection update, and audit event.
- Use conditional updates/version checks to prevent two workers consuming the
  same available balance concurrently.
- Unique indexes are required for movement IDs, idempotency keys within their
  scope, document numbers, and balance keys.
- If MongoDB transactions are unavailable, fail closed. Do not fall back to
  several independent writes.
- Retries with the same idempotency key return the original result and do not
  post stock twice.

## 6. Tank model

Create exactly nine configured tank records with stable IDs and zero opening
balances. Do not infer capacity, volume, or density. Tank metadata may include
a display name, active flag, and notes. A tank cannot be deleted after it has
movement history; it can only be deactivated.

## 7. Quality and availability

Oil can be physically present but unavailable for sale. Sale eligibility requires
a released lot with the required quality/analysis status. Quarantined, pending,
rejected, or otherwise blocked lots remain visible in physical stock but are
excluded from available-to-sell calculations.

Quality release is a controlled state transition with actor, timestamp, analysis
reference, and audit trail. A sale command must re-check release and ownership
inside its transaction.

## 8. Required acceptance tests

1. Initializing the nine tanks creates zero balances and no fabricated stock.
2. A transfer preserves lot and owner and conserves total quantity.
3. Customer-custody oil is excluded from mill-owned available stock.
4. A customer-owned lot cannot be sold as mill-owned stock.
5. A movement that would make a balance negative is rejected without partial writes.
6. Two concurrent withdrawals cannot overspend the same balance.
7. Repeating an idempotency key cannot duplicate a movement.
8. Reversing a movement creates a compensating entry and preserves the original.
9. A non-released lot cannot be sold even when physical balance is positive.
10. A transaction failure leaves no movement, balance change, or posted source document.
11. Tank capacity is not enforced until capacities are explicitly configured.
12. A balance projection can be rebuilt from the immutable movement ledger and
    reconciles exactly.

## 9. Implementation order

1. Pydantic schemas and Decimal quantity validation.
2. Tank and lot repositories with unique indexes.
3. Ledger posting service and transaction boundary.
4. Balance projection and negative-balance protection.
5. Idempotency and optimistic concurrency.
6. Audit events and reversal workflow.
7. API routes and permission matrix.
8. Integration tests against a replica-set MongoDB deployment.
9. Only then connect purchases, production, transfers, and bulk sales.


## 9. Lot ownership provenance versus current stock ownership

The `commercial_lots.owner` field records the lot's originating/initial owner
for traceability; it is not a live ownership register. A lot may be split across
MILL and one or more CUSTOMER balances after partial ownership transfers.
The append-only movement ledger is the authoritative ownership history; the
`commercial_stock_balances` collection is its live, owner-partitioned balance
projection. A command must select and debit the matching owner-specific balance
inside its transaction, never infer current ownership from the lot document.
Mill sales debit only MILL balances, customer pickups debit only the selected
customer's balances, and production consumes the owner recorded on each input
balance.
