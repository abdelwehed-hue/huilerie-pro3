# Approved Sale Returns, Quarantine, and Credit Notes — Design

Status: partial implementation in PR #147. Empty-tank role assignment, atomic physical return intake into quarantine, commercial acceptance, AVO credit notes, invoice net-receivable updates, and buyer-credit accrual are implemented on the feature branch. Cash refunds, buyer-credit settlement/application, return rejection/re-dispatch, and full browser acceptance remain unimplemented or unvalidated.

## Invariants

1. An approved sale, its invoice, payment records, and posted dispatch movements are never edited or deleted to represent a return.
2. A return is a new, append-only business document linked to the original sale and invoice.
3. Returned oil is never credited directly into an ordinary storage balance. It receives a new oil LOT with quality status `PENDING` and is physically segregated in a tank explicitly designated for quarantine.
4. Quarantined oil is excluded from sale selection and cannot be dispatched or used as production output.
5. Only a new, independent quality assessment and reviewer decision can release a returned lot. A released lot must then be transferred from the quarantine tank to a normal storage tank before it can be sold.
6. Commercial acceptance of a return and technical quality release are separate decisions. A credit note does not itself make oil sellable; quality release does not itself issue a credit note.
7. Quantity, monetary amounts, and balance calculations use Decimal/Decimal128 at 0.001 precision. No float arithmetic.
8. Every write is transactional, idempotent, version-checked, permission-checked, and audited.

## Documents and numbering

Use season-based identifiers and independent counters:
- Return receipt: `2627RET0001` (`RET`).
- Credit note / avoir: `2627AVO0001` (`AVO`).
- Returned oil receives a new LOT number from the existing LOT counter.

These codes are proposed domain abbreviations; they do not alter legacy document numbering. A number is never recycled after reservation.

## Return receipt workflow

Admin records a return against an APPROVED sale and its matching commercial invoice. Required fields:
- original sale ID and invoice ID (resolved and cross-checked by the server);
- return date, quantity in kg, reason, and designated quarantine tank;
- buyer/transport acknowledgement reference where available;
- idempotency key and expected sale version.

The backend:
- verifies the sale is approved and the invoice belongs to it;
- checks cumulative quantities on all previously received returns plus this request do not exceed the dispatched sale quantity;
- increments the sale's returned-quantity accumulator with an optimistic version condition, preventing concurrent over-return;
- creates a new MILL-owned oil LOT, linked to the return and original lot, with quality `PENDING`;
- creates a `RET` record and posts a `RECEIPT` movement into the quarantine tank;
- writes audit events and links the movement, return, and new lot in one MongoDB transaction.

A physically received return counts against the sale's remaining returnable quantity even while awaiting inspection. It is not silently voided. If goods must be sent back to the buyer after a rejected return, that requires a separate, explicit outbound movement workflow.

## Quarantine tank control

The existing nine tanks remain the only provisioned tanks; no tenth production tank is invented. An administrator must explicitly designate one or more of those tanks as `QUARANTINE`. No tank is designated automatically.

A tank can change role only when it has zero stock. The system must enforce:
- production output and normal receipts cannot target a quarantine tank;
- return receipts can target only an active quarantine tank;
- ordinary sale approval can source only an active normal-storage tank;
- quarantine stock can leave quarantine only through an internal transfer after its specific lot has a persisted `RELEASED` quality decision;
- ordinary stock cannot be transferred into quarantine except through the return-receipt workflow.

If no quarantine tank has been designated, return intake fails closed with a clear operational error. Tank capacity remains unset and unenforced, consistent with the current decision.

## Quality reinspection

The returned LOT starts `PENDING`. Existing independent lab submission/reviewer separation applies to it. A release decision makes the lot eligible for a controlled transfer to a normal storage tank; it does not move the stock automatically. A rejection leaves the stock in quarantine and unavailable for sale.

The original sold lot's quality decision is not changed. The returned oil is a separate lot so returned material cannot inherit the original lot's RELEASED state.

## Commercial acceptance and credit note

Physical receipt and commercial acceptance are separate. An administrator explicitly accepts or declines the return for credit after verifying the returned quantity and reason. This decision is audited and does not depend on whether the oil later passes quality inspection.

On acceptance, issue an append-only `AVO` credit note linked to the return, sale, buyer, and original invoice. Its amount is server-calculated from the accepted quantity multiplied by the original sale's frozen unit price. The client cannot set the amount. Cumulative credited quantity and value may never exceed the original dispatched quantity and invoice amount.

Credit notes reduce the invoice's net receivable, but never rewrite or delete payments. If payments already exceed the revised net invoice, the excess becomes a buyer credit balance; it is not automatically refunded as cash. A separate, audited refund/credit-settlement workflow is required before money can be paid back or the credit balance applied elsewhere.

Tax treatment remains `NOT_CONFIGURED`; the credit note is an internal commercial record until tax rules and legally compliant templates are approved.

## Validation coverage and remaining tests

MongoDB replica-set integration coverage now exercises atomic quarantine receipt, idempotent retries, cumulative return limits, AVO numbering, paid-in-full buyer-credit accrual, and partial-payment receivable recalculation. The full remaining list below is not yet complete.

- Return quantity exactly equal to remaining returnable quantity succeeds.
- Partial returns accumulate correctly; over-return fails.
- Two concurrent return requests cannot over-return the same sale.
- Return against draft/cancelled sale or mismatched invoice fails.
- Duplicate idempotency request returns the original return; key reuse with different payload fails.
- Return receipt, new LOT, stock receipt, sale accumulator, and audit all roll back together on any failure.
- Return receipt cannot use a normal tank; normal production/receipt cannot use a quarantine tank.
- Quarantine oil cannot be sold or transferred out before independent release.
- A rejected lot remains quarantined; the original lot's quality state remains unchanged.
- Credit note cannot exceed accepted return quantity or original invoice value.
- Credit note against unpaid, partially paid, and fully paid invoices calculates receivable/customer credit correctly.
- Payment records remain immutable; credit note does not trigger a cash refund.
- Arabic/French UI and desktop/mobile acceptance tests cover return intake, quality reinspection, credit note, and account summary.

## Operational release gate

Before production use, an administrator must physically designate at least one empty tank as quarantine and verify the tank's identity/label on site. Complete desktop/mobile browser acceptance, verify tax/legal treatment and credit-note templates with the relevant accountant, and complete backup/restore rehearsal plus production security review. Refund, buyer-credit application/settlement, and rejected-return outbound movement remain disabled until their own audited workflows are implemented. No production bootstrap, stock posting, or deployment is part of this design work.
