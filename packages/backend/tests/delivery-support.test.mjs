import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/database.mjs";
import { DeliverySupport } from "../src/delivery-support.ts";
import { DeliveryStore } from "../src/operational.ts";
import { FinancialOperations } from "../src/financial-operations.ts";

let fixture, admin, support, store;
let contactSequence = 0;
const reason =
  "Support case TEST: the service will bear any provider cost for this uncertain message.";
before(async () => {
  fixture = await createTestDatabase();
  admin = await fixture.createMember();
  await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [
    admin,
  ]);
  support = new DeliverySupport(fixture.repo, { commercePolicyApproved: true });
  store = new DeliveryStore(fixture.repo);
});
after(async () => {
  if (fixture) await fixture.close();
});
async function uncertain({ channel = "sms", status = "unknown", held = true } = {}) {
  const user = await fixture.createMember();
  const checkout = await fixture.repo.createCheckout(user, 100, randomUUID());
  const payment = {
    checkoutId: checkout.id,
    providerSessionId: "cs_" + randomUUID(),
    paymentIntentId: "pi_" + randomUUID(),
    amountCents: 100,
    currency: "cad",
    eventId: randomUUID(),
  };
  await fixture.repo.fundCheckout(payment);
  const value =
    channel === "sms"
      ? `+1416555${String(100 + ++contactSequence).padStart(4, "0")}`
      : user + "@example.test";
  await fixture.repo.upsertContact(
    user,
    channel,
    value,
    true,
    createHash("sha256").update(value).digest("hex"),
  );
  await fixture.repo.setConsent(user, channel, true, "fixture");
  const context = await store.context(user, channel);
  const id = await store.enqueue({
    userId: user,
    occurrenceKey: randomUUID(),
    channel,
    practiceId: "notice-your-neighbour",
    contentVersion: "v1",
    profileVersion: 1,
    context,
    payload: {
      to: value,
      body: "Synthetic practice.",
      localDate: "2026-10-17",
      quoteCents: 10,
      rateCents: 10,
      segments: 1,
    },
    scheduledAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
  });
  if (channel === "sms" && held) await fixture.repo.reserveCredits(user, id, 10);
  await fixture.sql.query("update app.deliveries set status=$2 where id=$1", [id, status]);
  return { id, user, checkout, payment };
}
function input(id, extra = {}) {
  return {
    operationId: randomUUID(),
    deliveryId: id,
    actorId: admin,
    reason,
    confirmed: true,
    ...extra,
  };
}
async function wallet(user) {
  return (await fixture.repo.getState(user)).wallet;
}

test("waivers require approved policy, explicit merchant-cost confirmation and an active admin", async () => {
  const { id, user } = await uncertain();
  await assert.rejects(new DeliverySupport(fixture.repo).waiveUnknownDelivery(input(id)), {
    code: "commerce_policy_required",
  });
  await assert.rejects(support.waiveUnknownDelivery(input(id, { confirmed: false })), {
    code: "confirmation_required",
  });
  await assert.rejects(support.waiveUnknownDelivery(input(id, { actorId: user })), {
    code: "operator_required",
  });
  await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'support')", [
    user,
  ]);
  await assert.rejects(support.waiveUnknownDelivery(input(id, { actorId: user })), {
    code: "operator_required",
  });
  assert.equal((await wallet(user)).reservedCents, 10);
});

test("waiver restores exactly the held amount once without changing delivery outcome or requeueing", async () => {
  const { id, user } = await uncertain();
  const request = input(id);
  const first = await support.waiveUnknownDelivery(request);
  assert.equal(first.amountCents, 10);
  assert.deepEqual(await support.waiveUnknownDelivery(request), first);
  const result = await wallet(user);
  assert.equal(result.availableCents, 100);
  assert.equal(result.reservedCents, 0);
  assert.equal((await store.get(id)).status, "unknown");
  assert.equal(
    (await store.claim(25)).some((row) => row.id === id),
    false,
  );
  await assert.rejects(fixture.repo.reserveCredits(user, id, 10), { code: "reservation_released" });
  await assert.rejects(
    support.waiveUnknownDelivery({ ...request, reason: "A different support request reason." }),
    { code: "operation_conflict" },
  );
  await assert.rejects(support.waiveUnknownDelivery(input(id)), { code: "waiver_unavailable" });
  assert.equal(
    (
      await fixture.sql.query(
        "select count(*)::int as total from app.credit_ledger where idempotency_key=$1",
        ["waiver:" + request.operationId],
      )
    ).rows[0].total,
    1,
  );
  await assert.rejects(
    fixture.sql.query("delete from app.delivery_charge_waivers where operation_id=$1", [
      request.operationId,
    ]),
    /immutable/i,
  );
  await assert.rejects(
    fixture.db.withUser(user, (sql) => sql.query("select * from app.delivery_charge_waivers")),
    /permission denied/i,
  );
});

test("late delivery success and failure update evidence without debiting or returning waived credit again", async () => {
  for (const status of ["delivered", "failed"]) {
    const { id, user } = await uncertain();
    await support.waiveUnknownDelivery(input(id));
    await store.finish(id, status, "SM_" + randomUUID());
    assert.equal((await store.get(id)).status, status);
    const result = await wallet(user);
    assert.equal(result.availableCents, 100);
    assert.equal(result.reservedCents, 0);
    assert.equal(
      (
        await fixture.sql.query("select status from app.credit_reservations where delivery_id=$1", [
          id,
        ])
      ).rows[0].status,
      "waived",
    );
    assert.equal((await fixture.repo.listLedger(user)).total, 3, "fund, reserve and waiver only");
  }
});

test("only unknown SMS with a matching held reservation can be waived", async () => {
  for (const options of [
    { status: "submitted" },
    { status: "sending" },
    { status: "delivered" },
    { channel: "email" },
    { held: false },
  ]) {
    const { id } = await uncertain(options);
    await assert.rejects(support.waiveUnknownDelivery(input(id)), { code: "waiver_unavailable" });
  }
  const finished = await uncertain();
  await fixture.repo.releaseCredits(finished.id);
  await assert.rejects(support.waiveUnknownDelivery(input(finished.id)), {
    code: "waiver_unavailable",
  });
});

test("account deletion can proceed after waived uncertainty and refunded credit while retaining financial audit", async () => {
  const { id, user, checkout, payment } = await uncertain();
  await assert.rejects(fixture.repo.prepareAccountDeletion(user), {
    code: "account_financial_review",
  });
  const waiver = await support.waiveUnknownDelivery(input(id));
  const finance = new FinancialOperations(fixture.repo, {
    async financialEvidence() {
      return {
        paymentIntentId: payment.paymentIntentId,
        amountCents: 100,
        currency: "cad",
        refunds: [],
        disputes: [],
        complete: true,
      };
    },
    async createRefund(request) {
      return {
        outcome: "accepted",
        refund: {
          id: "re_" + request.operationId,
          paymentIntentId: request.paymentIntentId,
          operationId: request.operationId,
          amountCents: request.amountCents,
          currency: "cad",
          status: "succeeded",
        },
      };
    },
  });
  const refund = await finance.requestRefund({
    operationId: randomUUID(),
    checkoutId: checkout.id,
    amountCents: 100,
    actorId: admin,
    reason: "Return the remaining unused credit before deleting this account.",
  });
  await finance.processRefund(refund.id);
  await fixture.repo.prepareAccountDeletion(user);
  await fixture.sql.query("delete from auth.users where id=$1", [user]);
  assert.equal(
    (await fixture.sql.query("select id from app.deliveries where id=$1", [id])).rows.length,
    0,
  );
  assert.equal(
    (
      await fixture.sql.query("select status from app.credit_reservations where delivery_id=$1", [
        id,
      ])
    ).rows[0].status,
    "waived",
  );
  assert.equal(
    (
      await fixture.sql.query(
        "select amount_cents from app.delivery_charge_waivers where operation_id=$1",
        [waiver.operationId],
      )
    ).rows[0].amount_cents,
    10,
  );
  assert.equal(
    (await fixture.sql.query("select user_id from app.wallets where id=$1", [waiver.walletId]))
      .rows[0].user_id,
    null,
  );
});
