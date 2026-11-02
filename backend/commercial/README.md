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
- Each document type has an independent sequence per season.
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
