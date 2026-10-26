import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/database.mjs";
import { FinancialOperations } from "../src/financial-operations.ts";
import { createStripeProvider } from "../src/providers/stripe.ts";

// Real embedded PostgreSQL, simulated Auth and provider. This is not live Stripe verification.
let fixture;
let admin;
before(async () => {
  fixture = await createTestDatabase();
  admin = await fixture.createMember();
  await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [
    admin,
  ]);
});
after(async () => {
  if (fixture) await fixture.close();
});
const auditReason = "Customer requested the return of unused credit.";

async function purchase(amountCents = 500, userId) {
  userId ??= await fixture.createMember();
  const checkout = await fixture.repo.createCheckout(userId, amountCents, randomUUID());
  const suffix = randomUUID().replaceAll("-", "");
  const payment = {
    checkoutId: checkout.id,
    providerSessionId: `cs_${suffix}`,
    paymentIntentId: `pi_${suffix}`,
    eventId: `evt_${suffix}`,
    amountCents,
    currency: "cad",
  };
  await fixture.repo.attachCheckoutSession(checkout.id, payment.providerSessionId);
  await fixture.repo.fundCheckout(payment);
  return { userId, checkout, payment };
}
async function balance(userId) {
  return (
    await fixture.sql.query(
      "select available_cents as available,reserved_cents as reserved,blocked_reason as blocked from app.wallets where user_id=$1",
      [userId],
    )
  ).rows[0];
}
function provider(payment) {
  const refunds = [];
  const disputes = [];
  const calls = [];
  const fake = {
    evidenceComplete: true,
    outcome: "accepted",
    refunds,
    disputes,
    calls,
    async financialEvidence(paymentIntentId) {
      return {
        paymentIntentId,
        amountCents: payment.amountCents,
        currency: "cad",
        complete: fake.evidenceComplete,
        refunds: [...refunds],
        disputes: [...disputes],
      };
    },
    async createRefund(input) {
      calls.push(input);
      if (fake.outcome === "unknown") return { outcome: "unknown", code: "TIMEOUT" };
      if (fake.outcome === "rejected")
        return { outcome: "rejected", code: "DECLINED", retryable: false };
      const refund = {
        id: `re_${randomUUID().replaceAll("-", "")}`,
        paymentIntentId: input.paymentIntentId,
        operationId: input.operationId,
        amountCents: input.amountCents,
        currency: "cad",
        status: "succeeded",
      };
      refunds.push(refund);
      return { outcome: "accepted", refund };
    },
    async retrieveRefund(id) {
      const row = refunds.find((row) => row.id === id);
      if (!row) throw new Error("Unavailable");
      return { ...row };
    },
    async listFundingSessions() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async retrieveFunding() {
      return {
        status: "paid",
        sessionId: payment.providerSessionId,
        paymentIntentId: payment.paymentIntentId,
        amountCents: payment.amountCents,
        currency: "cad",
      };
    },
  };
  return fake;
}
function request(checkout, amountCents = 200, extra = {}) {
  return {
    operationId: randomUUID(),
    checkoutId: checkout.id,
    amountCents,
    actorId: admin,
    reason: auditReason,
    ...extra,
  };
}

test("refund requests require an active admin and immutable audited unused-credit holds", async () => {
  const { userId, checkout, payment } = await purchase();
  const finance = new FinancialOperations(fixture.repo, provider(payment));
  const input = request(checkout);
  await assert.rejects(finance.requestRefund({ ...input, actorId: userId }), {
    code: "operator_required",
  });
  await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'support')", [
    userId,
  ]);
  await assert.rejects(finance.requestRefund({ ...input, actorId: userId }), {
    code: "operator_required",
  });
  await assert.rejects(finance.requestRefund({ ...input, reason: "short" }), {
    code: "invalid_reason",
  });
  const held = await finance.requestRefund(input);
  assert.equal(held.holdState, "held");
  assert.deepEqual(await balance(userId), { available: 300, reserved: 200, blocked: null });
  await finance.requestRefund(input);
  assert.deepEqual(await balance(userId), { available: 300, reserved: 200, blocked: null });
  await assert.rejects(finance.requestRefund({ ...input, amountCents: 250 }), {
    code: "operation_conflict",
  });
  await assert.rejects(finance.requestRefund(request(checkout, 301)), {
    code: "insufficient_funds",
  });
  await assert.rejects(
    fixture.db.withUser(userId, (sql) => sql.query("select * from app.refund_operations")),
    /permission denied/i,
  );
  await assert.rejects(
    fixture.sql.query("update app.refund_operations set amount_cents=1 where id=$1", [held.id]),
    /immutable/i,
  );
  const audit = (
    await fixture.sql.query(
      "select count(*)::int as count from app.operator_audit where action='refund.request' and target_id=$1",
      [held.id],
    )
  ).rows[0];
  assert.equal(audit.count, 1);
});

test("refund success settles once; late pending cannot regress; later provider failure restores once", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  const settled = await finance.processRefund(held.id);
  assert.equal(settled.status, "succeeded");
  assert.deepEqual(await balance(userId), { available: 300, reserved: 0, blocked: null });
  await finance.processRefund(held.id);
  await finance.handleRefundEvent(settled.providerRefundId, "evt_repeat");
  assert.equal(fake.calls.length, 1);
  fake.refunds[0].status = "pending";
  await finance.handleRefundEvent(settled.providerRefundId, "evt_late_pending");
  assert.equal((await finance.getRefund(held.id)).status, "succeeded");
  fake.refunds[0].status = "failed";
  await finance.handleRefundEvent(settled.providerRefundId, "evt_late_failed");
  await finance.handleRefundEvent(settled.providerRefundId, "evt_failed_duplicate");
  assert.deepEqual(await balance(userId), { available: 500, reserved: 0, blocked: null });
  const rows = (
    await fixture.sql.query(
      "select kind from app.credit_ledger where idempotency_key like $1 order by created_at",
      ["%" + held.id],
    )
  ).rows;
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["refund_hold", "refund_settle", "refund_return"],
  );
});

test("preflight failures remain safely retryable before any submission", async () => {
  const { checkout, payment } = await purchase();
  const fake = provider(payment);
  fake.evidenceComplete = false;
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  const waiting = await finance.processRefund(held.id);
  assert.equal(waiting.status, "requested");
  assert.equal(waiting.attemptedAt, null);
  assert.equal(fake.calls.length, 0);
  fake.evidenceComplete = true;
  assert.equal((await finance.processRefund(held.id)).status, "succeeded");
  assert.equal(fake.calls.length, 1);
});

test("preflight records external refund evidence once and freezes credit before another submission", async () => {
  for (const status of ["succeeded", "pending", "requires_action"]) {
    const { userId, checkout, payment } = await purchase();
    const fake = provider(payment);
    const finance = new FinancialOperations(fixture.repo, fake);
    const held = await finance.requestRefund(request(checkout));
    fake.refunds.push({
      id: "re_external_preflight_" + held.id,
      paymentIntentId: payment.paymentIntentId,
      operationId: null,
      amountCents: 100,
      currency: "cad",
      status,
    });
    // Even an incomplete listing cannot hide an already observed loss from spending controls.
    fake.evidenceComplete = status !== "requires_action";
    for (let repeat = 0; repeat < 2; repeat++) {
      const waiting = await finance.processRefund(held.id);
      assert.equal(waiting.status, "requested");
      assert.equal(waiting.attemptedAt, null);
      assert.equal(waiting.holdState, "held");
    }
    assert.equal(fake.calls.length, 0);
    assert.deepEqual(await balance(userId), {
      available: 300,
      reserved: 200,
      blocked: "payment_refund",
    });
    const events = (
      await fixture.sql.query(
        "select kind,amount_cents from app.financial_events where payment_intent_id=$1",
        [payment.paymentIntentId],
      )
    ).rows;
    assert.deepEqual(events, [{ kind: "refund", amount_cents: 100 }]);
    assert.equal((await fixture.repo.listLedger(userId)).total, 2, "Only funding and its hold");
    if (status === "succeeded") {
      const resolution = await finance.resolveIncident({
        operationId: randomUUID(),
        paymentIntentId: payment.paymentIntentId,
        actorId: admin,
        reason: "Reconciled the external refund against the complete provider history.",
      });
      assert.equal(resolution.adjustmentCents, -100);
      assert.equal((await finance.processRefund(held.id)).status, "succeeded");
      assert.equal(fake.calls.length, 1);
      assert.deepEqual(await balance(userId), { available: 200, reserved: 0, blocked: null });
    }
  }
});

test("preflight reconciles matching local refund history without another debit or false external incident", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  fake.outcome = "unknown";
  const finance = new FinancialOperations(fixture.repo, fake);
  const earlier = await finance.requestRefund(request(checkout, 100));
  await finance.processRefund(earlier.id);
  fake.refunds.push({
    id: "re_local_preflight_" + earlier.id,
    paymentIntentId: payment.paymentIntentId,
    operationId: earlier.id,
    amountCents: 100,
    currency: "cad",
    status: "succeeded",
  });
  for (const status of ["failed", "canceled"])
    fake.refunds.push({
      id: "re_external_" + status + earlier.id,
      paymentIntentId: payment.paymentIntentId,
      operationId: null,
      amountCents: 5,
      currency: "cad",
      status,
    });
  fake.outcome = "accepted";
  for (const cents of [200, 50]) {
    const next = await finance.requestRefund(request(checkout, cents));
    assert.equal((await finance.processRefund(next.id)).status, "succeeded");
  }
  assert.equal((await finance.getRefund(earlier.id)).holdState, "settled");
  assert.equal(fake.calls.length, 3, "One original unknown submission and two new operations");
  assert.deepEqual(await balance(userId), { available: 150, reserved: 0, blocked: null });
  assert.equal(
    (
      await fixture.sql.query(
        "select count(*)::int as total from app.financial_events where payment_intent_id=$1",
        [payment.paymentIntentId],
      )
    ).rows[0].total,
    0,
  );
  assert.equal(
    (
      await fixture.sql.query(
        "select count(*)::int as total from app.credit_ledger where idempotency_key=$1",
        ["refund-settle:" + earlier.id],
      )
    ).rows[0].total,
    1,
  );
});

test("preflight observed active or lost disputes restrict spending until evidence-backed resolution", async () => {
  for (const status of ["under_review", "lost"]) {
    const { userId, checkout, payment } = await purchase();
    const fake = provider(payment);
    const finance = new FinancialOperations(fixture.repo, fake);
    const held = await finance.requestRefund(request(checkout));
    fake.disputes.push({ id: "dp_preflight_" + held.id, amountCents: 100, status });
    await finance.processRefund(held.id);
    await finance.processRefund(held.id);
    assert.equal(fake.calls.length, 0);
    assert.deepEqual(await balance(userId), {
      available: 300,
      reserved: 200,
      blocked: "payment_dispute",
    });
    assert.deepEqual(
      (
        await fixture.sql.query(
          "select kind,amount_cents from app.financial_events where payment_intent_id=$1",
          [payment.paymentIntentId],
        )
      ).rows,
      [{ kind: "dispute", amount_cents: 100 }],
    );
    const resolution = await finance.resolveIncident({
      operationId: randomUUID(),
      paymentIntentId: payment.paymentIntentId,
      actorId: admin,
      reason: "Reviewed authoritative dispute evidence before any further refund submission.",
    });
    if (status === "lost") {
      assert.equal(resolution.adjustmentCents, -100);
      assert.equal((await finance.processRefund(held.id)).status, "succeeded");
      assert.deepEqual(await balance(userId), { available: 200, reserved: 0, blocked: null });
    } else {
      assert.equal(resolution.result, "pending");
      assert.equal((await finance.processRefund(held.id)).holdState, "held");
      assert.equal(fake.calls.length, 0);
    }
  }
});

test("failed refund after account deletion restores credit into a visible restricted incident once", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout, 500));
  await finance.processRefund(held.id);
  await fixture.repo.prepareAccountDeletion(userId);
  await fixture.sql.query("delete from auth.users where id=$1", [userId]);
  fake.refunds[0].status = "failed";
  await finance.handleRefundEvent(fake.refunds[0].id, "evt_detached_failure");
  await finance.handleRefundEvent(fake.refunds[0].id, "evt_detached_failure_duplicate");
  const wallet = (
    await fixture.sql.query(
      "select user_id,available_cents,reserved_cents,blocked_reason from app.wallets where id=$1",
      [held.walletId],
    )
  ).rows[0];
  assert.deepEqual(wallet, {
    user_id: null,
    available_cents: 500,
    reserved_cents: 0,
    blocked_reason: "payment_refund_returned_after_deletion",
  });
  const events = (
    await fixture.sql.query(
      "select wallet_id,kind,amount_cents from app.financial_events where payment_intent_id=$1",
      [payment.paymentIntentId],
    )
  ).rows;
  assert.deepEqual(events, [{ wallet_id: held.walletId, kind: "refund", amount_cents: 500 }]);
  const result = await finance.resolveIncident({
    operationId: randomUUID(),
    paymentIntentId: payment.paymentIntentId,
    actorId: admin,
    reason: "Reviewed the failed refund for a deleted account before attempting its return again.",
  });
  assert.equal(result.adjustmentCents, 0);
  assert.equal(result.result, "resolved");
  assert.equal(
    (
      await fixture.sql.query("select available_cents from app.wallets where id=$1", [
        held.walletId,
      ])
    ).rows[0].available_cents,
    500,
  );
});

test("unknown submission retains hold and discovery never creates a second refund", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  fake.outcome = "unknown";
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  assert.equal((await finance.processRefund(held.id)).status, "unknown");
  await finance.processRefund(held.id);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(await balance(userId), { available: 300, reserved: 200, blocked: null });
  await assert.rejects(
    finance.cancelAbsentRefund({ refundId: held.id, actorId: admin, reason: auditReason }),
    { code: "refund_pending" },
  );
  fake.refunds.push({
    id: "re_discovered",
    paymentIntentId: payment.paymentIntentId,
    operationId: held.id,
    amountCents: 200,
    currency: "cad",
    status: "succeeded",
  });
  assert.equal((await finance.processRefund(held.id)).status, "succeeded");
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(await balance(userId), { available: 300, reserved: 0, blocked: null });
});

test("admin cancellation releases only a never-submitted or old proven-absent operation", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  fake.outcome = "unknown";
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  await finance.processRefund(held.id);
  await fixture.sql.query(
    "update app.refund_operations set attempted_at=now()-interval '27 hours' where id=$1",
    [held.id],
  );
  fake.evidenceComplete = false;
  await assert.rejects(
    finance.cancelAbsentRefund({ refundId: held.id, actorId: admin, reason: auditReason }),
    { code: "refund_pending" },
  );
  fake.evidenceComplete = true;
  await finance.cancelAbsentRefund({ refundId: held.id, actorId: admin, reason: auditReason });
  await finance.cancelAbsentRefund({ refundId: held.id, actorId: admin, reason: auditReason });
  assert.deepEqual(await balance(userId), { available: 500, reserved: 0, blocked: null });
  assert.equal(fake.calls.length, 1);
  const fresh = await finance.requestRefund(request(checkout));
  assert.equal(
    (await finance.cancelAbsentRefund({ refundId: fresh.id, actorId: admin, reason: auditReason }))
      .status,
    "canceled",
  );
});

test("unexpected provider success after a released hold freezes for evidence-based reconciliation", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  await finance.cancelAbsentRefund({ refundId: held.id, actorId: admin, reason: auditReason });
  fake.refunds.push({
    id: "re_after_cancel_" + held.id,
    paymentIntentId: payment.paymentIntentId,
    operationId: held.id,
    amountCents: 200,
    currency: "cad",
    status: "succeeded",
  });
  await finance.handleRefundEvent(fake.refunds[0].id, "evt_after_cancel");
  assert.ok((await balance(userId)).blocked);
  const resolved = await finance.resolveIncident({
    operationId: randomUUID(),
    paymentIntentId: payment.paymentIntentId,
    actorId: admin,
    reason: auditReason,
  });
  assert.equal(resolved.adjustmentCents, -200);
  assert.equal(resolved.result, "resolved");
  await finance.handleRefundEvent(fake.refunds[0].id, "evt_after_cancel_duplicate");
  assert.deepEqual(await balance(userId), { available: 300, reserved: 0, blocked: null });
});

test("definitive refund rejection releases a hold once", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  fake.outcome = "rejected";
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  assert.equal((await finance.processRefund(held.id)).status, "failed");
  await finance.processRefund(held.id);
  assert.deepEqual(await balance(userId), { available: 500, reserved: 0, blocked: null });
  assert.equal(fake.calls.length, 1);
});

test("signed cumulative evidence for authorized refunds avoids a new freeze, while external refunds freeze", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  const finance = new FinancialOperations(fixture.repo, fake);
  const held = await finance.requestRefund(request(checkout));
  await finance.processRefund(held.id);
  assert.deepEqual(
    await finance.handleChargeRefundEvent({
      paymentIntentId: payment.paymentIntentId,
      eventId: "evt_own_" + held.id,
      amountCents: 200,
    }),
    { matched: true },
  );
  assert.equal((await balance(userId)).blocked, null);
  fake.refunds.push({
    id: "re_external",
    paymentIntentId: payment.paymentIntentId,
    operationId: null,
    amountCents: 100,
    currency: "cad",
    status: "succeeded",
  });
  assert.deepEqual(
    await finance.handleChargeRefundEvent({
      paymentIntentId: payment.paymentIntentId,
      eventId: "evt_external_" + held.id,
      amountCents: 300,
    }),
    { matched: false },
  );
  assert.ok((await balance(userId)).blocked);
  const input = {
    operationId: randomUUID(),
    paymentIntentId: payment.paymentIntentId,
    actorId: admin,
    reason: auditReason,
  };
  const resolved = await finance.resolveIncident(input);
  assert.equal(resolved.adjustmentCents, -100);
  await finance.resolveIncident(input);
  assert.deepEqual(await balance(userId), { available: 200, reserved: 0, blocked: null });
  await assert.rejects(
    fixture.sql.query("update app.financial_resolutions set reason=$2 where operation_id=$1", [
      input.operationId,
      "Changed audit reason.",
    ]),
    /immutable/i,
  );
});

test("incomplete history cannot unfreeze; active disputes remain pending; lost disputes cannot create negative credit", async () => {
  const { userId, payment } = await purchase();
  const fake = provider(payment);
  const finance = new FinancialOperations(fixture.repo, fake);
  await fixture.repo.restrictWalletByPaymentIntent({
    paymentIntentId: payment.paymentIntentId,
    eventId: "evt_dispute_" + payment.checkoutId,
    kind: "dispute",
    amountCents: 500,
  });
  const input = {
    operationId: randomUUID(),
    paymentIntentId: payment.paymentIntentId,
    actorId: admin,
    reason: auditReason,
  };
  fake.evidenceComplete = false;
  await assert.rejects(finance.resolveIncident(input), { code: "reconciliation_incomplete" });
  assert.ok((await balance(userId)).blocked);
  fake.evidenceComplete = true;
  fake.disputes.push({ id: "dp_review", amountCents: 500, status: "under_review" });
  assert.equal((await finance.resolveIncident(input)).result, "pending");
  fake.disputes[0].status = "lost";
  const result = await finance.resolveIncident({ ...input, operationId: randomUUID() });
  assert.equal(result.adjustmentCents, -500);
  assert.equal(result.debtCents, 0);
  assert.equal(result.result, "resolved");
  assert.deepEqual(await balance(userId), { available: 0, reserved: 0, blocked: null });
  fake.disputes[0].status = "won";
  const restored = await finance.resolveIncident({ ...input, operationId: randomUUID() });
  assert.equal(restored.adjustmentCents, 500);
  assert.deepEqual(await balance(userId), { available: 500, reserved: 0, blocked: null });
});

test("external refund debt preserves a freeze when other held credit cannot fund the adjustment", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  const finance = new FinancialOperations(fixture.repo, fake);
  await finance.requestRefund(request(checkout, 400));
  fake.refunds.push({
    id: "re_outside_hold",
    paymentIntentId: payment.paymentIntentId,
    operationId: null,
    amountCents: 300,
    currency: "cad",
    status: "succeeded",
  });
  await fixture.repo.restrictWalletByPaymentIntent({
    paymentIntentId: payment.paymentIntentId,
    eventId: "evt_debt_" + checkout.id,
    kind: "refund",
    amountCents: 300,
  });
  const result = await finance.resolveIncident({
    operationId: randomUUID(),
    paymentIntentId: payment.paymentIntentId,
    actorId: admin,
    reason: auditReason,
  });
  assert.equal(result.adjustmentCents, -100);
  assert.equal(result.debtCents, 200);
  assert.equal(result.result, "pending");
  const wallet = await balance(userId);
  assert.equal(wallet.available, 0);
  assert.equal(wallet.reserved, 400);
  assert.ok(wallet.blocked);
});

test("Checkout discovery persists pagination, validates a unique match, and funds exactly once", async () => {
  const userId = await fixture.createMember();
  const checkout = await fixture.repo.createCheckout(userId, 500, randomUUID());
  await fixture.sql.query(
    "update app.checkout_intents set created_at=now()-interval '27 hours' where id=$1",
    [checkout.id],
  );
  const payment = {
    providerSessionId: "cs_recovered",
    paymentIntentId: "pi_recovered_" + checkout.id,
    amountCents: 500,
  };
  const fake = provider(payment);
  const calls = [];
  fake.listFundingSessions = async (input) => {
    calls.push(input);
    return input.cursor
      ? {
          items: [{ id: "cs_recovered", fundingId: checkout.id }],
          hasMore: false,
          nextCursor: null,
        }
      : {
          items: [{ id: "cs_unrelated", fundingId: "other" }],
          hasMore: true,
          nextCursor: "cs_unrelated",
        };
  };
  const finance = new FinancialOperations(fixture.repo, fake);
  await finance.reconcileCheckouts({ limit: 1, maxPages: 1 });
  assert.equal((await fixture.repo.getCheckout(checkout.id)).status, "pending");
  assert.equal((await balance(userId)).available, 0);
  await fixture.sql.query("update app.checkout_intents set next_reconcile_at=now() where id=$1", [
    checkout.id,
  ]);
  await finance.reconcileCheckouts({ limit: 1, maxPages: 1 });
  assert.equal(calls[1].cursor, "cs_unrelated");
  assert.equal((await fixture.repo.getCheckout(checkout.id)).status, "paid");
  await finance.reconcileCheckouts({ limit: 1, maxPages: 1 });
  assert.equal((await balance(userId)).available, 500);
  assert.equal(fake.calls.length, 0);
});

test("Checkout discovery waits beyond request retry window and requires complete absence", async () => {
  const userId = await fixture.createMember();
  const checkout = await fixture.repo.createCheckout(userId, 500, randomUUID());
  const fake = provider({ amountCents: 500 });
  const finance = new FinancialOperations(fixture.repo, fake);
  let scans = 0;
  fake.listFundingSessions = async () => {
    scans++;
    return { items: [], hasMore: false, nextCursor: null };
  };
  await fixture.sql.query(
    "update app.checkout_intents set created_at=now()-interval '6 hours' where id=$1",
    [checkout.id],
  );
  await finance.reconcileCheckouts({ limit: 1, maxPages: 1 });
  assert.equal(scans, 0);
  assert.equal((await fixture.repo.getCheckout(checkout.id)).status, "pending");
  await fixture.sql.query(
    "update app.checkout_intents set created_at=now()-interval '27 hours',next_reconcile_at=now() where id=$1",
    [checkout.id],
  );
  await finance.reconcileCheckouts({ limit: 1, maxPages: 1 });
  assert.equal(scans, 1);
  assert.equal((await fixture.repo.getCheckout(checkout.id)).status, "cancelled");
  assert.equal((await balance(userId)).available, 0);
});

test("Stripe adapter binds exact refund metadata and idempotency; incomplete or wrong-mode history cannot authorize credit", async () => {
  const requests = [];
  const operationId = randomUUID();
  let mode = false;
  const port = {
    async createSession() {
      throw new Error("Must never create Checkout in reconciliation");
    },
    async retrieveSession() {
      throw new Error("unused");
    },
    async createRefund(parameters, options) {
      requests.push({ parameters, options });
      return {
        id: "re_provider",
        payment_intent: "pi_provider",
        amount: 200,
        currency: "cad",
        status: "pending",
        metadata: { operationId },
      };
    },
    async retrievePaymentIntent() {
      return {
        id: "pi_provider",
        currency: "cad",
        amount_received: 500,
        status: "succeeded",
        livemode: mode,
      };
    },
    async listRefunds() {
      return {
        data: [
          {
            id: "re_provider",
            payment_intent: "pi_provider",
            amount: 200,
            currency: "cad",
            status: "pending",
            metadata: { operationId },
          },
        ],
        has_more: true,
      };
    },
    async listDisputes() {
      return { data: [], has_more: false };
    },
  };
  const adapter = createStripeProvider(
    {
      secretKey: "sk_test_fixture",
      webhookSecret: "whsec_fixture",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      liveMode: false,
    },
    port,
  );
  assert.equal(
    (await adapter.createRefund({ operationId, paymentIntentId: "pi_provider", amountCents: 200 }))
      .outcome,
    "accepted",
  );
  assert.equal(requests[0].options.idempotencyKey, `sms-refund/${operationId}`);
  assert.equal(requests[0].parameters.amount, 200);
  assert.equal(requests[0].parameters.metadata.operationId, operationId);
  assert.equal((await adapter.financialEvidence("pi_provider", 1)).complete, false);
  mode = true;
  await assert.rejects(adapter.financialEvidence("pi_provider"), /STRIPE_PAYMENT_MISMATCH/);
  port.createRefund = async () => {
    throw { statusCode: 409 };
  };
  assert.equal(
    (await adapter.createRefund({ operationId, paymentIntentId: "pi_provider", amountCents: 200 }))
      .outcome,
    "unknown",
  );
});
