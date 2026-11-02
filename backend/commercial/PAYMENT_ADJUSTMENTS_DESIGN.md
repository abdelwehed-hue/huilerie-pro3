# Commercial Payment Reversals and Buyer-Credit Settlement — Design

Status: design only. No payment reversal, cash refund, or buyer-credit application endpoint is implemented.

## Non-negotiable invariants

1. A posted PAY payment is immutable. Never edit/delete its amount, date, method, or reference to simulate a reversal.
2. A reversal is a new, append-only REV document linked to exactly one original PAY record, its invoice, and buyer.
3. Cumulative reversals against a payment cannot exceed the original payment amount. Partial reversals are allowed; each requires a reason and traceable external reference when applicable.
4. Invoice paid amount is recalculated from immutable payments minus immutable reversals. Outstanding amount is recalculated against the invoice's current net receivable after AVO credit notes.
5. A reversal never creates a cash refund. It restores receivable or reduces unspent buyer credit; refunding cash is a separate workflow.
6. Buyer credit cannot become negative. A reversal that would consume credit already applied or refunded must fail closed until the prior settlement/refund is itself reversed through a compensating record.
7. All calculations use Decimal/Decimal128 at three decimal places. All writes are transactional, idempotent, version-checked, permission-checked, and audited.

## Payment reversal (REV)

The command should require:
- original payment ID (the server resolves invoice and buyer);
- reversal amount in DT, strictly positive and <= remaining reversible amount;
- reversal date and reason;
- bank/cheque chargeback or other evidence reference where applicable;
- expected invoice version and idempotency key.

The backend must:
- verify the payment exists and is posted;
- aggregate prior REV documents for that payment and reject any cumulative amount above the PAY amount;
- derive invoice net receivable from gross invoice amount minus AVO credit notes;
- derive cash-paid amount from posted PAY records minus REV records, not from client input;
- calculate prior and new buyer-credit excess attributable to that invoice;
- if buyer credit must be reduced, verify the invoice-attributed credit is still available and that aggregate buyer credit remains non-negative;
- create a REV document, append a negative buyer-credit ledger adjustment if required, update invoice derived paid/outstanding/payment status, and write audit events in one MongoDB transaction.

Do not mutate the original payment record. A REV document can be partial, so multiple REV documents may link to one PAY, but their total must remain <= the original payment.

## Interaction with credit notes

Example: invoice gross 500 DT; payments 500 DT; AVO credit note 100 DT; net receivable 400 DT; buyer credit 100 DT. If a 100 DT payment reversal is later accepted, paid becomes 400 DT, outstanding remains 0 DT, and buyer credit falls to 0 DT. If the buyer credit has already been applied or refunded, the reversal must be blocked unless that settlement/refund is first reversed.

This is why buyer credit entries must be attributable to source invoice and source document, not only to buyer. The ledger should be append-only and its running balance reconcilable to all entries.

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
- Source-link indexes from REV to PAY and CAP to source credit/target invoice.
- Multiple partial reversals cannot exceed a payment; concurrent reversals cannot over-reverse.
- Reversal of a payment after an AVO credit note reduces invoice-attributed buyer credit correctly.
- Reversal fails if required buyer credit has already been consumed/refunded.
- Reversal does not mutate the original PAY document or create a cash refund.
- CAP is restricted to the same buyer and cannot exceed credit balance or invoice outstanding.
- CAP leaves cash-paid amount and PAY records unchanged.
- Cash refund requires separate authorization and reconciliation; duplicate requests are idempotent.
- All failure paths roll back document, invoice, buyer-credit ledger, and audit writes together.

## Release gate

Keep REV, CAP, and cash-refund actions disabled until their service, ledger indexes, concurrent transaction tests, bilingual UI, bank/cash reconciliation, and approval controls are complete. This design does not authorize production financial postings.
