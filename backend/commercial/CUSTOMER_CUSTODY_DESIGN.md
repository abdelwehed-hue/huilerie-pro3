# Customer-Owned Oil Custody and Ownership Settlement — Design

Status: design only. Customer-owned/consignment ownership is represented in stock balances and production output, but customer pickup, ownership transfer authorization, and owner settlement statements are not yet implemented as a complete workflow.

## Core ownership rules

1. Customer-owned oil remains the customer's property even when physically stored in one of the mill's tanks.
2. The stock ledger identity includes owner kind and customer ID. Never aggregate customer-owned balances into MILL-owned stock.
3. A mill wholesale sale may source only MILL-owned oil with a RELEASED quality decision in normal storage.
4. Customer-owned oil cannot be sold by the mill, used to fulfill another buyer's sale, or pledged as mill inventory.
5. A change from CUSTOMER ownership to MILL ownership requires explicit customer authorization and a separate ownership-transfer document. An internal ledger adjustment alone is not sufficient evidence of consent.
6. Customer pickup is a custody release, not a sale and not a transfer of ownership.
7. No service fee, commission, yield guarantee, oil price, or owner compensation formula is assumed by the system. These require explicit commercial policy/contract configuration.

## Customer custody statement

For each customer and product lot, the statement should reconcile:

Opening customer-owned quantity
+ actual production output allocated to that customer
+ customer-owned transfers received
- customer pickups
- customer-authorized transfers to MILL ownership
= ending customer-owned quantity.

All quantities are Decimal128 to 0.001 kg. The statement must be reproducible from append-only source documents and stock ledger movements. It must not depend on mutable UI totals.

## Customer pickup workflow

Proposed document type: CUS (custody release), subject to final naming approval.

Required fields:
- customer ID;
- one or more customer-owned oil lots and quantities;
- source tank for each lot;
- release date;
- customer or authorized representative acknowledgement;
- reason/reference and idempotency key.

The service must:
- validate each lot is CUSTOMER-owned by this customer;
- validate the source tank is active and not quarantine;
- validate sufficient available balance for each lot;
- create a CUS release document and outbound stock movements in one transaction;
- keep lot owner and historical ownership unchanged;
- audit the actor and customer acknowledgement;
- reject cross-customer lot IDs and over-pickup.

If the oil is still in quarantine, it cannot be picked up through this ordinary release workflow; it first requires the same independent quality decision and quarantine exit controls.

## Customer-authorized ownership transfer

Proposed document type: OWN (ownership transfer), subject to final naming approval.

Required evidence:
- customer authorization reference or signed consent record;
- source customer and destination MILL ownership;
- lot and quantity;
- agreed compensation/price only when the contract explicitly requires it;
- expected lot/balance versions and idempotency key.

The service must:
- ensure the source owner matches the authorizing customer;
- debit CUSTOMER balance and credit MILL balance atomically;
- preserve the original lot identity and full movement history;
- create an immutable ownership-transfer document and audit event;
- prevent quantity from exceeding the customer's available balance;
- keep quality status unchanged; ownership change never releases quality.

If compensation is due, create a separate payable/settlement record; do not silently treat ownership transfer as cash payment.

## Consignment / sale-on-behalf-of-owner

Do not allow the mill to sell customer-owned oil merely because it is stored on site. If a future consignment agreement permits the mill to sell on the owner's behalf, it needs a separate authorization model and a three-party settlement ledger:
- buyer receivable and payment;
- owner proceeds payable;
- mill commission/fees only as defined by contract;
- deductions, tax treatment, and payout reconciliation.

No consignment sale should reuse the current MILL-owned sale endpoint or relabel customer stock without a documented transfer/agency agreement.

## Required tests

- Customer A cannot view, release, transfer, or sell Customer B's lot.
- Customer pickup reduces only the matching customer's stock and does not change owner.
- Pickup quantity cannot exceed available balance, including concurrent release attempts.
- Ownership transfer requires explicit authorization and cannot overdraw customer balance.
- Transfer changes the balance owner atomically but does not change lot quality.
- Customer-owned and MILL-owned balances for the same lot never collapse into one balance key.
- Customer custody statements reconcile to ledger source documents for opening, production, transfers, pickup, and ownership changes.
- Customer-owned stock is excluded from all mill sale selectors and server-side dispatch checks.
- Any future consignment workflow separately reconciles buyer receipts, owner payable, commission, and payout; no unapproved assumptions are embedded.

## Release gate

Keep customer pickup, ownership transfer, and consignment sale actions disabled until the document types, authorization evidence, settlement policy, customer statement, transaction tests, bilingual UI, and legal/tax treatment are approved. This design does not authorize stock or financial postings.
