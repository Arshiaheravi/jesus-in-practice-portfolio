// All provider requests use injected mocks. SDK signatures are exercised locally.
import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { createStripeProvider } from "../src/providers/stripe.ts";

const config = {
  secretKey: "sk_test_fixture",
  webhookSecret: "whsec_fixture",
  successUrl: "https://app.example.test/wallet?checkout=complete",
  cancelUrl: "https://app.example.test/wallet?checkout=cancelled",
  liveMode: false,
};
const input = { fundingId: "funding-fixture", userId: "user-fixture", amountCents: 2500 };
const session = {
  id: "cs_test_fixture",
  url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
  livemode: false,
  mode: "payment",
  currency: "cad",
  amount_total: 2500,
  client_reference_id: input.userId,
  metadata: { fundingId: input.fundingId, userId: input.userId },
  payment_status: "paid",
  status: "complete",
  payment_intent: "pi_fixture",
};
const port = (overrides = {}) => ({
  createSession: async () => session,
  retrieveSession: async () => session,
  ...overrides,
});

test("Checkout uses server CAD amount and a stable operation key", async () => {
  let observed;
  const provider = createStripeProvider(
    config,
    port({
      createSession: async (...args) => {
        observed = args;
        return session;
      },
    }),
  );
  const result = await provider.createCheckout(input);
  assert.equal(result.outcome, "accepted");
  assert.equal(result.status, "pending");
  assert.deepEqual(observed[0].allowed_payment_method_types, ["card"]);
  assert.equal(observed[0].line_items[0].price_data.currency, "cad");
  assert.equal(observed[0].line_items[0].price_data.unit_amount, 2500);
  assert.equal(observed[0].success_url, config.successUrl);
  assert.equal(observed[0].metadata.fundingId, input.fundingId);
  assert.equal(observed[1].idempotencyKey, `sms-funding/${input.fundingId}`);
  assert.equal(observed[1].maxNetworkRetries, 2);
  await assert.rejects(
    provider.createCheckout({ ...input, amountCents: 25.5 }),
    /integer CAD cents/,
  );
});

test("Checkout uncertainty never becomes a second adapter submission", async () => {
  let calls = 0;
  const provider = createStripeProvider(
    { ...config, timeoutMs: 5 },
    port({
      createSession: () => {
        calls++;
        return new Promise(() => {});
      },
    }),
  );
  assert.deepEqual(await provider.createCheckout(input), {
    outcome: "unknown",
    code: "STRIPE_TIMEOUT",
  });
  assert.equal(calls, 1);
  const wrongUrl = createStripeProvider(
    config,
    port({ createSession: async () => ({ ...session, url: "https://other.example.test/pay" }) }),
  );
  assert.equal((await wrongUrl.createCheckout(input)).outcome, "unknown");
});

test("Checkout preserves Stripe URL fragments while requiring the trusted origin", async () => {
  const url = `${session.url}#provider-session-state`;
  const provider = createStripeProvider(
    config,
    port({ createSession: async () => ({ ...session, url }) }),
  );
  const result = await provider.createCheckout(input);
  assert.equal(result.outcome, "accepted");
  assert.equal(result.url, url);
  for (const invalidUrl of [
    "https://other.example.test/pay#provider-session-state",
    "http://checkout.stripe.com/pay#provider-session-state",
    "https://fixture:fixture@checkout.stripe.com/pay#provider-session-state",
  ]) {
    const invalid = createStripeProvider(
      config,
      port({ createSession: async () => ({ ...session, url: invalidUrl }) }),
    );
    assert.equal((await invalid.createCheckout(input)).outcome, "unknown");
  }
});

test("financial history rejects noninteger page budgets before provider reads", async () => {
  let reads = 0;
  const provider = createStripeProvider(
    config,
    port({
      retrievePaymentIntent: async () => {
        reads++;
        return {
          id: "pi_fixture",
          currency: "cad",
          livemode: false,
          status: "succeeded",
          amount_received: 2500,
        };
      },
    }),
  );
  for (const budget of [NaN, Infinity, -Infinity, 1.5]) {
    await assert.rejects(provider.financialEvidence("pi_fixture", budget), /page budget/);
  }
  assert.equal(reads, 0);
});

test("retrieval binds payment to the precise user, funding, currency, environment and amount", async () => {
  const provider = createStripeProvider(config, port());
  assert.deepEqual(await provider.retrieveFunding({ ...input, sessionId: session.id }), {
    status: "paid",
    sessionId: session.id,
    paymentIntentId: "pi_fixture",
    amountCents: 2500,
    currency: "cad",
  });
  for (const patch of [
    { currency: "usd" },
    { amount_total: 1000 },
    { client_reference_id: "other" },
    { metadata: { ...session.metadata, fundingId: "other" } },
    { metadata: { ...session.metadata, userId: "other" } },
    { livemode: true },
    { mode: "subscription" },
  ]) {
    const invalid = createStripeProvider(
      config,
      port({ retrieveSession: async () => ({ ...session, ...patch }) }),
    );
    await assert.rejects(
      invalid.retrieveFunding({ ...input, sessionId: session.id }),
      /STRIPE_FUNDING_MISMATCH/,
    );
  }
  for (const [patch, expected] of [
    [{ payment_status: "unpaid" }, "pending"],
    [{ payment_status: "unpaid", status: "expired" }, "failed"],
  ]) {
    const pending = createStripeProvider(
      config,
      port({ retrieveSession: async () => ({ ...session, ...patch }) }),
    );
    assert.equal(
      (await pending.retrieveFunding({ ...input, sessionId: session.id })).status,
      expected,
    );
  }
});

test("Stripe SDK verifies raw signatures, rejects tampering, stale events and live/test mismatch", () => {
  const sdk = new Stripe(config.secretKey);
  const provider = createStripeProvider(config, port());
  const payload = JSON.stringify({
    id: "evt_fixture",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: session },
  });
  const sign = (body, timestamp = Math.floor(Date.now() / 1000)) =>
    sdk.webhooks.generateTestHeaderString({
      payload: body,
      secret: config.webhookSecret,
      timestamp,
    });
  assert.equal(provider.verifyWebhook(payload, sign(payload)).id, "evt_fixture");
  assert.throws(() => provider.verifyWebhook(payload + " ", sign(payload)), /verification failed/);
  assert.throws(() => provider.verifyWebhook(payload, sign(payload, 1)), /verification failed/);
  const live = payload.replace('"livemode":false', '"livemode":true');
  assert.throws(() => provider.verifyWebhook(live, sign(live)), /verification failed/);
});
