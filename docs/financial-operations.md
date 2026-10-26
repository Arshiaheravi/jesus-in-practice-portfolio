# Financial operations

The member account and email service are free. This module manages prepaid CAD SMS credit, unused-credit refunds, and payment exceptions. It does not implement subscription billing, arbitrary balance edits, or an unconditional wallet-unfreeze action.

## Authorization and records

`packages/backend/src/financial-operations.ts` is a server capability. Operator HTTP routes must verify the Supabase user, an active database operator role, and recent MFA before a financial mutation. The module independently checks an active `admin` role for refund requests, cancellations, and incident resolutions. Support access is read-only.

Migration `202610170005_financial_operations.sql` adds durable refund requests, reconciliation state, and immutable resolution evidence. Member roles cannot read or mutate these operational tables. Financial records retain opaque actor and wallet identifiers without requiring the member's private profile to remain present. Request identity, amount, purchase, and reason cannot be changed after insertion. Ledger entries and financial resolution records are append-only.

All monetary amounts are integer CAD cents. The existing wallet holds both delivery reservations and refund reservations; `reservedCents` is not exclusively money waiting for an SMS. The ledger distinguishes each kind. Payment operations acquire the same PostgreSQL advisory payment lock used by funding and incident recording, followed by the wallet lock. Provider calls occur outside database transactions.

## Unused-credit refunds

1. An administrator selects a verified paid purchase, an amount, and a meaningful audit reason. `requestRefund` accepts a caller-generated UUID operation ID. Repeating the same request returns its existing record. Reusing that ID with different details fails.
2. The transaction checks the wallet restriction, available credit, and amounts already committed against that purchase. It moves the amount from available to reserved credit and writes a `refund_hold` ledger entry. This is a request, not a completed return of money.
3. The maintenance worker calls `processRefund`. A durable lease prevents competing submissions. Before the first submission, the provider history must be complete and have no unresolved dispute. Matching local refunds reconcile against their existing holds. An observed external nonfailed refund or active/lost dispute records an idempotent incident and freezes spendable credit before submission, including when a webhook has not arrived. The hold remains intact for review or cancellation. Repeated identical evidence does not reopen an already resolved incident. Failed preflight checks keep a request eligible for a later safe preflight retry.
4. Immediately before the provider call, the database records that submission may have begun. Stripe receives the exact purchase payment intent, amount, operation metadata, and stable `sms-refund/<operationId>` idempotency key.
5. A verified successful refund consumes the hold once. A definitive provider rejection, cancellation, or failure releases it once. If Stripe later reports that an initially successful refund failed, a separate ledger entry restores the credit once. If the member has already deleted their account, the restored detached-wallet credit also creates one durable financial incident and restriction so an administrator can arrange its return; it does not disappear into an unmonitored balance.
6. A timeout or interrupted response leaves the hold in place. Subsequent processing retrieves the known refund or searches complete payment refund history for the operation metadata. It does not blindly submit a second refund, including after Stripe's idempotency-key retention window.

`cancelAbsentRefund` can release a request that was never submitted, provided no worker currently holds its lease. An attempted request additionally needs to be more than 26 hours old, have no known provider refund ID, and have complete current provider history proving the operation absent. The cancellation is audited. Evidence of a refund unexpectedly arriving after release creates a financial incident and freezes the wallet for reconciliation; it is not ignored and does not silently spend restored credit.

Known provider refunds cannot be canceled through this app. Pending or uncertain provider outcomes remain reserved until evidence resolves them. Stripe returns money to the original payment method; timing and final success are provider-dependent. See Stripe's [refund lifecycle](https://docs.stripe.com/refunds), [create-refund contract](https://docs.stripe.com/api/refunds/create), and [idempotency behavior](https://docs.stripe.com/api/idempotent_requests).

## Signed events and incident resolution

The HTTP webhook boundary verifies Stripe's raw signature and configured test/live mode before calling financial methods. The module then retrieves authoritative current state, so duplicate or older webhook deliveries do not directly overwrite a newer status.

- `handleRefundEvent(refundId, eventId)` reconciles an authorized local request or records an external refund incident.
- `handleChargeRefundEvent({ paymentIntentId, eventId, amountCents })` compares the signed cumulative refunded amount with complete provider history. If every successful refund is a matching authorized local operation already reflected in the ledger, it avoids creating an unnecessary new restriction. External, pending, incomplete, or mismatched evidence records an incident. It never clears an existing restriction.
- Dispute events retain the existing durable financial-incident behavior. A closed dispute is evidence for review; closure alone is not permission to unfreeze credit.

`resolveIncident({ operationId, paymentIntentId, actorId, reason })` retrieves the payment, paginated refund history, and paginated dispute history. It refuses incomplete history. The normal adapter budget is at most three pages of 100 records for each collection, within one overall provider timeout. A busy payment that exceeds this coverage remains restricted rather than being treated as fully reviewed.

The resolution derives external loss from successful refunds and lost disputes, capped at the original paid amount, and subtracts local refund debits already applied. It adjusts only the difference from its previous reconciliation. Available credit never becomes negative: any amount that cannot be recovered is recorded as reconciliation debt and keeps the wallet restricted. Pending refunds and open disputes also keep the restriction. Later verified reversals can restore only the amount previously debited through this reconciliation path.

A resolution ID is idempotent. Its provider evidence, resulting adjustment, unrecovered amount, and reason are immutable. New financial events arriving while provider evidence is fetched cause a conflict instead of allowing a stale review to clear the wallet. Other unresolved payment incidents or reconciliation debts on the same wallet prevent release. There is no amount field on the resolution command.

Stripe exposes separate paginated [refund history](https://docs.stripe.com/api/refunds/list) and [dispute history](https://docs.stripe.com/api/disputes/list). The implementation does not treat a charge's embedded refund list as complete history.

## Uncertain SMS charge waivers

`DeliverySupport.waiveUnknownDelivery` is a separate administrator action for an SMS whose status is still `unknown` and whose exact reservation is still held. It requires an approved commerce-policy setting, explicit confirmation that the service bears any provider cost, a stable operation UUID, and an audit reason. The HTTP boundary additionally requires recent MFA. There is no arbitrary amount field and no time-based automatic waiver.

The transaction locks profile, wallet, delivery, then reservation. It restores only that reservation's amount, appends a `waiver` ledger entry and immutable audit record, and marks the reservation `waived`. The delivery remains `unknown` and is never requeued. Later signed success or failure can update delivery evidence, but cannot debit or release that waived amount again. An account can be deleted after other funds and obligations are resolved; detached waiver and ledger evidence survive deletion of private delivery data.

The bounded operator review queue excludes waived reservations before selecting its 50 oldest uncertain deliveries. This keeps waived SMS from displacing newer unresolved holds; it does not alter or remove the delivery history. Uncertain email deliveries without a credit reservation remain visible.

## Stale Checkout recovery

`reconcileCheckouts({ limit, maxPages })` claims a bounded batch of stale pending purchases with `FOR UPDATE SKIP LOCKED`. A known Checkout session is retrieved and matched to the exact user, operation, amount, currency, and environment before funding or expiration.

If the initial session-creation response was lost, discovery uses Stripe's [Checkout session list](https://docs.stripe.com/api/checkout/sessions/list) with a fixed creation-time interval and exact `fundingId` metadata matching. The app stops new creation retries after 23 hours; discovery waits until the local purchase is more than 26 hours old. Each bounded run persists its cursor and matches. It requires a complete scan before attaching a unique match or canceling an operation with no provider session. Multiple matches remain a review case. No reconciliation path creates a Checkout session or starts another charge.

Maintenance runs must be scheduled by the deployment operator. Methods have bounded item/page counts and provider timeouts; writing these methods does not prove that a hosted schedule is configured or running.

## Verification and deployment limits

`packages/backend/tests/financial-operations.test.mjs` exercises real embedded PostgreSQL migrations and transactions with simulated Auth roles and provider responses. It covers authorization, idempotent holds, immutable evidence, unknown outcomes, late callbacks, original-versus-external refund accounting, reconciliation debt, and resumable Checkout discovery. Its single-session fixture is not proof of independent-server-session concurrency. Separate PostgreSQL integration evidence, when run, belongs in the operational verification record.

No live refund, payment, webhook, or external database migration was performed while implementing this module. Before production use, configure the provider secrets and webhook event subscriptions, apply reviewed migrations through the release process, schedule maintenance, enroll operator MFA, and complete Stripe test-mode acceptance checks with the intended account. Keep support records free of card details and private reflections.
