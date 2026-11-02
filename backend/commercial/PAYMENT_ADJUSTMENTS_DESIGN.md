# Commercial Payment Reversals and Buyer-Credit Settlement — Design

Status: **partially implemented**. Non-cash buyer-credit application (CAP) and immutable payment reversal (REV) are implemented with source-credit allocation, invoice/buyer version checks, and transactional ledger updates. Cash refund remains disabled.

## Non-negotiable invariants

1. A posted PAY payment is immutable. Never edit/delete its amount, date, method, or reference to simulate a reversal.
2. A reversal is a new, append-only REV document linked to exactly one original PAY record, its invoice, and buyer.
3. Cumulative reversals against a payment cannot exceed the original payment amount. Partial reversals are allowed; each requires a reason and traceable external reference when applicable.
4. Invoice paid amount is recalculated from immutable payments minus immutable reversals. Outstanding amount is recalculated against the invoice's current net receivable after AVO credit notes.
5. A reversal never creates a cash refund. It restores receivable or reduces unspent buyer credit; refunding cash is a separate workflow.
6. Buyer credit cannot become negative. A reversal that would consume credit already applied or refunded must fail closed until the prior settlement/refund is itself reversed through a compensating record.
7. All calculations use Decimal/Decimal128 at three decimal places. All writes are transactional, idempotent, version-checked, permission-checked, and audited.

## Implemented payment reversal (REV)

- `POST /api/commercial/v1/sale-payments/{payment_id}/reversals` — administrator-only partial or full reversal.
- `GET /api/commercial/v1/sales-invoices/{invoice_id}/payment-reversals` — read reversal history.
- Requires positive amount, business reversal date, reason, expected invoice version, and idempotency key. Bank/cheque reversals require traceable evidence.
- Aggregates prior REV documents and rejects cumulative reversals above the original PAY amount.
- Keeps the original PAY immutable and appends a separately numbered REV document.
- Recalculates cash-paid amount and invoice outstanding from the original invoice net receivable and current applied credit.
- When an AVO created buyer credit on the same invoice, reduces only the still-available source credit and appends ledger adjustments; blocks if that source credit was already consumed.
- Updates invoice/buyer balances, REV, source-ledger adjustments, and audit event in one MongoDB transaction.
- Does not issue cash or bank refunds.

Integration tests cover append-only reversal, idempotency, payment and invoice limits, credit-note interaction, insufficient/consumed source credit, and transaction rollback.

## Interaction with credit notes

Example: invoice gross 500 DT; payments 500 DT; AVO credit note 100 DT; net receivable 400 DT; buyer credit 100 DT. If a 100 DT payment reversal is later accepted, paid becomes 400 DT, outstanding remains 0 DT, and buyer credit falls to 0 DT. If the buyer credit has already been applied or refunded, the reversal must be blocked unless that settlement/refund is first reversed.

This is why buyer credit entries must be attributable to source invoice and source document, not only to buyer. The ledger should be append-only and its running balance reconcilable to all entries.

## Implemented buyer-credit application — CAP

The CAP endpoint is POST /api/commercial/v1/sales-invoices/{invoice_id}/credit-applications. It requires an administrator, a current invoice version, a positive amount, a reason, and an idempotency key.

The service:
- verifies invoice receivable fields reconcile before writing;
- verifies buyer credit balance equals the remaining source credit-note ledger balances;
- allocates the requested amount FIFO across issued AVO credit notes;
- verifies each source credit note belongs to the same buyer;
- creates a CAP document and one append-only CREDIT_APPLICATION ledger adjustment per source credit note;
- decreases buyer credit balance and target invoice outstanding atomically;
- increments invoice applied_credit_amount_dt without changing cash paid amount or PAY records;
- records source allocations, reason, actor, and audit event;
- rejects amount above available buyer credit or invoice outstanding;
- uses a separate season-scoped CAP counter.

The invoice payment_status now represents settlement status (cash paid plus applied credit), while paid_amount_dt remains cash only. Buyer account summaries expose cash paid, applied credit, total settled, outstanding, and buyer credit balance separately.

## Buyer-credit application

Applying buyer credit to a new invoice is not a cash payment and must not create a PAY document. It should create a separate credit-application document (proposed type CAP) linked to:
- buyer;
- source credit balance/ledger entries;
- target invoice;
- applied amount.

The service must verify the buyer's available credit, target invoice's outstanding net amount, and buyer match. It then atomically decreases buyer credit and invoice outstanding, while leaving cash paid amount and all PAY records unchanged. The target invoice status is recalculated. The source credit is consumed once only, with an auditable ledger entry.

A buyer credit cannot be applied to an invoice belonging to a different buyer. Amount cannot exceed either available buyer credit or target invoice outstanding.

## Cash refund

A cash refund is a separate bank/cash disbursement workflow, not an invoice payment reversal and not a credit-note action. It requires an approved refund request, payment method, destination/reference, proof of disbursement, authorization separation, and an immutable refund document. The buyer-credit liability is reduced only after confirmed disbursement. No cash refund should be enabled until cash/bank reconciliation and approval controls are implemented.

## Required indexes and tests

- Unique season/document number and idempotency keys for REV and CAP documents.
- CAP source-credit allocation indexes and append-only ledger adjustment uniqueness.
- Source-link indexes from REV to PAY and CAP to source credit/target invoice.
- REV is integration-tested for append-only writes, source-credit reconciliation, idempotency, and transaction rollback.
- Multiple partial reversals cannot exceed a payment; concurrent reversals cannot over-reverse.
- Reversal of a payment after an AVO credit note reduces invoice-attributed buyer credit correctly.
- Reversal fails if required buyer credit has already been consumed/refunded.
- Reversal does not mutate the original PAY document or create a cash refund.
- CAP is restricted to the same buyer and cannot exceed credit balance or invoice outstanding; FIFO source allocation, idempotency, ledger mismatch, and transaction rollback are integration-tested.
- CAP leaves cash-paid amount and PAY records unchanged.
- Cash refund requires separate authorization and reconciliation; duplicate requests are idempotent.
- All failure paths roll back document, invoice, buyer-credit ledger, and audit writes together.

## Release gate

Keep cash-refund actions disabled until bank/cash reconciliation, proof-of-disbursement, and approval-separation controls are implemented. REV and CAP are implemented but must still pass full release and browser-acceptance gates before production deployment. This design does not authorize production financial postings.
