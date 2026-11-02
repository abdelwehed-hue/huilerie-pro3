# Customer-Owned Oil Custody and Ownership Settlement

Status: **partially implemented**. Customer-owned olive intake (CIN) and customer-owned oil pickup (CUS) are implemented as transactional workflows. A read-only custody statement is implemented and reconciles the append-only ledger to live balances. Customer-authorized ownership transfer, owner payout, and consignment sales remain deferred.

## Core ownership rules

1. Customer-owned oil remains the customer's property even when physically stored in a mill tank.
2. The stock ledger identity includes product, lot, owner kind, stable custody-owner ID, and location. Customer balances never merge into MILL balances.
3. Mill wholesale sales may source only MILL-owned oil with a RELEASED quality decision in normal storage.
4. Customer-owned oil cannot be sold by the mill, used to fulfill another buyer's sale, or pledged as mill inventory.
5. Customer pickup is a custody release, not a sale and not a transfer of ownership.
6. No service fee, commission, yield guarantee, oil price, or owner compensation formula is assumed. These require explicit commercial policy and contract configuration.

## Customer identity

- Commercial custody uses a stable commercial_custody_owners.id as the stock owner identity.
- On first custody intake, the backend links the owner record to an existing legacy client by normalized phone and stores a display-name snapshot.
- The legacy clients and loads records are read-only references; custody workflows do not rewrite or migrate legacy pressing records.
- Oil pickup uses the stable custody owner ID, not the phone number, so later phone changes do not change the ledger owner identity.

## Implemented customer olive intake — CIN

The CIN document records olives physically received from a customer for custody. It is not an olive purchase and creates no supplier payable or mill-owned asset.

Required fields:
- existing client phone (used only to resolve/create the stable custody-owner record);
- receipt date in the active season;
- registered olive variety;
- quantity in kg to 0.001;
- active olive storage/staging location;
- customer acknowledgement reference;
- optional source reference and notes;
- idempotency key.

The service:
- resolves or creates the stable custody-owner record;
- verifies the client, variety, and receiving location;
- creates a CUSTOMER-owned olive LOT;
- creates the CIN receipt and posts the MVT receipt movement;
- writes stock balance and audit events in the same MongoDB transaction;
- does not create a purchase, supplier debt, or MILL-owned stock.

## Implemented customer oil pickup — CUS

The CUS document releases customer-owned oil to its owner. It is not a sale and does not create an invoice.

Required fields:
- stable custody-owner ID;
- release date in the active season;
- customer-owned oil lot;
- active normal source tank (quarantine is forbidden);
- quantity in kg to 0.001;
- customer acknowledgement reference;
- reason and idempotency key.

The service:
- verifies the selected lot belongs to the exact custody owner;
- requires the lot's independent quality status to be RELEASED;
- posts an outbound DISPATCH movement from the selected tank;
- debits only the matching customer/lot/tank balance;
- rejects insufficient stock and cross-customer lot IDs;
- creates the CUS document, MVT ledger entry, and audit events atomically;
- leaves the lot's customer ownership unchanged.

Frontend tab: **Garde des clients / أمانة الحرفاء**. It provides intake and pickup forms plus receipt/release histories. Only administrators can post these operations; workers can read according to commercial.read.

## Customer-authorized ownership transfer — deferred

Proposed document type: OWN. It is not enabled yet.

Required evidence:
- customer authorization reference or signed consent record;
- source customer and destination MILL ownership;
- lot and quantity;
- agreed compensation/price only when the contract explicitly requires it;
- expected lot/balance versions and idempotency key.

The service must debit CUSTOMER balance and credit MILL balance atomically, preserve lot identity/history, and audit the authorization. If compensation is due, a separate payable/settlement record is required. Do not silently treat ownership transfer as cash payment.

## Implemented custody statement

The read-only endpoint GET /api/commercial/v1/customer-custody/owners/{customer_id}/statement returns chronological customer-owned OLIVE and OIL movements, per-product running balances, and current stock totals. It recalculates balances from the append-only MVT ledger and fails closed with a reconciliation conflict if the ledger does not equal the live stock-balance collection. The statement includes internal transfers with zero net owner quantity change.

## Consignment — deferred

A future customer statement must reconcile:

Opening customer-owned quantity
+ actual production output allocated to that customer
+ customer-owned transfers received
- customer pickups
- customer-authorized transfers to MILL ownership
= ending customer-owned quantity.

All quantities must be reproduced from append-only source documents and stock ledger movements, not mutable UI totals.

Do not allow the mill to sell customer-owned oil merely because it is stored on site. Any future consignment agreement needs a separate three-party settlement ledger for buyer receivable, owner proceeds payable, mill commission/fees, deductions, tax treatment, and payout reconciliation. It must not reuse the MILL-owned sale endpoint.

## Tests and release gates

Implemented automated coverage:
- customer intake creates a stable custody owner, CUSTOMER-owned olive lot, CIN document, MVT receipt, stock balance, and audit events atomically;
- repeating the same idempotency key does not duplicate owner, lot, receipt, or stock;
- customer pickup debits the matching customer balance only;
- cross-customer pickup is rejected;
- oil with pending quality cannot be picked up;
- customer-owned stock remains excluded from mill sale selection and dispatch.

Remaining gates:
- real browser acceptance on desktop and mobile;
- customer phone-change/owner-profile maintenance workflow;
- customer custody statement reconciliation;
- explicit OWN authorization and compensation policy;
- owner payout/consignment policy, if ever required;
- backup restoration and production security review.

No customer-owned stock should be moved, transferred, or settled outside these controlled workflows.
