import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

import { consentVersion } from "../../../packages/backend/src/contracts.ts";
import { FinancialOperations } from "../../../packages/backend/src/financial-operations.ts";
import { DeliveryStore } from "../../../packages/backend/src/operational.ts";
import { createStripeProvider } from "../../../packages/backend/src/providers/stripe.ts";
import { createTwilioProvider } from "../../../packages/backend/src/providers/twilio.ts";
import * as tokens from "../../../packages/backend/src/tokens.ts";
import { createTestDatabase } from "../../../packages/backend/tests/helpers/database.mjs";

const require = createRequire(import.meta.url);
const backendRequire = createRequire(
  new URL("../../../packages/backend/package.json", import.meta.url),
);
const ts = require("typescript");
const Stripe = backendRequire("stripe");
const twilioSdk = backendRequire("twilio");
const origin = "https://member.example.test";
const stripeSecret = "whsec_isolated_webhook_fixture";
const destinationSecret = "isolated-destination-fixture-secret-123456789";
const environment = {
  NEXT_PUBLIC_APP_MODE: "live",
  APP_ORIGIN: origin,
  DESTINATION_HASH_SECRET: destinationSecret,
};
const previousEnvironment = new Map();
const sessions = new Map();
const refunds = new Map();
const stripeReads = [];
const forbiddenProviderCall = async () => assert.fail("No provider network or send is allowed");
const stripeProvider = createStripeProvider(
  {
    secretKey: "sk_test_isolated_fixture",
    webhookSecret: stripeSecret,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
    liveMode: false,
  },
  {
    createSession: forbiddenProviderCall,
    async retrieveSession(id) {
      stripeReads.push(id);
      const session = sessions.get(id);
      if (session instanceof Error) throw session;
      assert.ok(session, "Only a captured synthetic session may be retrieved");
      return session;
    },
    async retrieveRefund(id) {
      assert.ok(refunds.has(id), "Only a captured synthetic refund may be retrieved");
      return refunds.get(id);
    },
    createRefund: forbiddenProviderCall,
    listSessions: forbiddenProviderCall,
    listRefunds: forbiddenProviderCall,
    listDisputes: forbiddenProviderCall,
    retrievePaymentIntent: forbiddenProviderCall,
  },
);
const twilioConfig = {
  accountSid: `AC${"a".repeat(32)}`,
  apiKeySid: `SK${"b".repeat(32)}`,
  apiKeySecret: "isolated-fixture",
  authToken: "isolated-twilio-signing-fixture",
  verifyServiceSid: `VA${"c".repeat(32)}`,
  messagingServiceSid: `MG${"d".repeat(32)}`,
  publicWebhookBaseUrl: origin,
};
const twilioProvider = createTwilioProvider(twilioConfig, {
  lookupPhone: forbiddenProviderCall,
  startVerification: forbiddenProviderCall,
  checkVerification: forbiddenProviderCall,
  sendMessage: forbiddenProviderCall,
  getMessage: forbiddenProviderCall,
});
let fixture;
let store;
let stripePost;
let statusPost;
let inboundPost;
let phoneSequence = 0;

// Actual route/wrapper/provider/domain source and embedded PostgreSQL; only network ports
// and server module wiring are injected. This is not hosted delivery or independent-session evidence.
async function loadSource(relativePath, dependencies) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

before(async () => {
  for (const [name, value] of Object.entries(environment)) {
    previousEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
  fixture = await createTestDatabase();
  store = new DeliveryStore(fixture.repo);
  const config = await loadSource("../lib/server/config.ts", { "server-only": {} });
  const http = await loadSource("../lib/server/http.ts", {
    "server-only": {},
    "node:crypto": crypto,
    "next/server": require("next/server"),
    "./config": config,
  });
  const dependencies = {
    "node:crypto": crypto,
    "@jesus-in-practice/backend/financial-operations": { FinancialOperations },
    "@jesus-in-practice/backend/operational": { DeliveryStore },
    "@jesus-in-practice/backend/tokens": tokens,
    "@/lib/server/config": config,
    "@/lib/server/http": http,
    "@/lib/server/providers": { stripe: () => stripeProvider, twilio: () => twilioProvider },
    "@/lib/server/runtime": { repository: () => fixture.repo, database: () => fixture.db },
  };
  stripePost = (await loadSource("../app/api/webhooks/stripe/route.ts", dependencies)).POST;
  statusPost = (await loadSource("../app/api/webhooks/twilio/status/route.ts", dependencies)).POST;
  inboundPost = (await loadSource("../app/api/webhooks/twilio/inbound/route.ts", dependencies))
    .POST;
});
after(async () => {
  try {
    await fixture?.close();
  } finally {
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

function assertHeaders(response) {
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
}
function stripeRequest(event, { signature, raw = JSON.stringify(event) } = {}) {
  return new Request(`${origin}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature":
        signature ??
        Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: stripeSecret }),
    },
    body: raw,
  });
}
const stripeEvent = (type, object, overrides = {}) => ({
  id: `evt_${crypto.randomUUID()}`,
  object: "event",
  type,
  livemode: false,
  data: { object },
  ...overrides,
});
async function receipt(provider, id) {
  return (
    await fixture.sql.query(
      "select status from app.webhook_receipts where provider=$1 and event_id=$2",
      [provider, id],
    )
  ).rows[0]?.status;
}
async function wallet(userId) {
  const value = (await fixture.repo.getState(userId)).wallet;
  return {
    available: value.availableCents,
    reserved: value.reservedCents,
    blocked: value.blockedReason,
  };
}
async function ledgerCount(userId) {
  return (
    await fixture.sql.query(
      "select count(*)::int as total from app.credit_ledger l join app.wallets w on w.id=l.wallet_id where w.user_id=$1",
      [userId],
    )
  ).rows[0].total;
}
async function checkout() {
  const userId = await fixture.createMember();
  const intent = await fixture.repo.createCheckout(userId, 1000, crypto.randomUUID());
  const session = {
    id: `cs_${crypto.randomUUID().replaceAll("-", "")}`,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    payment_intent: `pi_${crypto.randomUUID().replaceAll("-", "")}`,
    currency: "cad",
    amount_total: 1000,
    client_reference_id: userId,
    metadata: { userId, fundingId: intent.id },
    livemode: false,
  };
  sessions.set(session.id, session);
  return { userId, intent, session };
}

test("Stripe invalid signatures, wrong mode and oversized bodies are rejected before persistence", async () => {
  const event = stripeEvent("checkout.session.completed", {});
  const reads = stripeReads.length;
  for (const request of [
    stripeRequest(event, { signature: "invalid" }),
    stripeRequest({ ...event, livemode: true }),
  ]) {
    const response = await stripePost(request);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_SIGNATURE");
    assertHeaders(response);
  }
  assert.equal((await stripePost(stripeRequest(event, { raw: "x".repeat(262145) }))).status, 413);
  assert.equal(await receipt("stripe", event.id), undefined);
  assert.equal(stripeReads.length, reads);
});

test("Stripe paid callbacks fund once before attachment; duplicates and stale expiration cannot remove credit", async () => {
  const { userId, intent, session } = await checkout();
  assert.equal(intent.providerSessionId, null);
  const paid = stripeEvent("checkout.session.completed", session);
  for (const event of [
    paid,
    paid,
    stripeEvent("checkout.session.expired", {
      ...session,
      status: "expired",
      payment_status: "unpaid",
    }),
  ]) {
    const response = await stripePost(stripeRequest(event));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
    assertHeaders(response);
  }
  assert.equal((await fixture.repo.getCheckout(intent.id)).status, "paid");
  assert.equal((await wallet(userId)).available, 1000);
  assert.equal(await ledgerCount(userId), 1);
  assert.equal(stripeReads.filter((id) => id === session.id).length, 2);
  assert.equal(await receipt("stripe", paid.id), "processed");
});

test("Stripe unpaid completion waits for authoritative paid state and expiration leaves an unpaid wallet empty", async () => {
  const pending = await checkout();
  const unpaid = { ...pending.session, payment_status: "unpaid", payment_intent: null };
  sessions.set(unpaid.id, unpaid);
  assert.equal(
    (await stripePost(stripeRequest(stripeEvent("checkout.session.completed", unpaid)))).status,
    200,
  );
  assert.equal(await ledgerCount(pending.userId), 0);
  sessions.set(unpaid.id, pending.session);
  assert.equal(
    (
      await stripePost(
        stripeRequest(stripeEvent("checkout.session.async_payment_succeeded", unpaid)),
      )
    ).status,
    200,
  );
  assert.equal((await wallet(pending.userId)).available, 1000);
  const expired = await checkout();
  sessions.set(expired.session.id, {
    ...expired.session,
    status: "expired",
    payment_status: "unpaid",
    payment_intent: null,
  });
  assert.equal(
    (await stripePost(stripeRequest(stripeEvent("checkout.session.expired", expired.session))))
      .status,
    200,
  );
  assert.equal((await fixture.repo.getCheckout(expired.intent.id)).status, "expired");
  assert.equal(await ledgerCount(expired.userId), 0);
});

test("Stripe unavailable or mismatched provider evidence remains retryable without credit or private error output", async (context) => {
  const errors = [];
  context.mock.method(console, "error", (value) => errors.push(value));
  const { userId, session } = await checkout();
  const event = stripeEvent("checkout.session.completed", session);
  for (const evidence of [
    new Error("PRIVATE_PROVIDER_RESPONSE"),
    { ...session, amount_total: 999 },
  ]) {
    sessions.set(session.id, evidence);
    const response = await stripePost(stripeRequest(event));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /PRIVATE_PROVIDER_RESPONSE|STRIPE_FUNDING_MISMATCH/);
    assert.notEqual(await receipt("stripe", event.id), "processed");
    assert.equal(await ledgerCount(userId), 0);
  }
  assert.doesNotMatch(errors.join("\n"), /PRIVATE_PROVIDER_RESPONSE|STRIPE_FUNDING_MISMATCH/);
  sessions.set(session.id, session);
  assert.equal((await stripePost(stripeRequest(event))).status, 200);
  assert.equal(await ledgerCount(userId), 1);
  assert.equal(await receipt("stripe", event.id), "processed");
});

test("Stripe unrelated events are acknowledged, while missing owned checkout remains unresolved", async (context) => {
  context.mock.method(console, "error", () => {});
  const unrelated = stripeEvent("checkout.session.completed", { id: "cs_unrelated", metadata: {} });
  assert.equal((await stripePost(stripeRequest(unrelated))).status, 200);
  assert.equal(await receipt("stripe", unrelated.id), "processed");
  const missing = stripeEvent("checkout.session.completed", {
    id: "cs_missing",
    metadata: { fundingId: crypto.randomUUID() },
  });
  const response = await stripePost(stripeRequest(missing));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "RECONCILIATION_REQUIRED");
  assert.notEqual(await receipt("stripe", missing.id), "processed");
});

test("Stripe external refund and dispute callbacks restrict credit without inventing a ledger adjustment", async () => {
  for (const kind of ["refund", "dispute"]) {
    const { userId, session } = await checkout();
    assert.equal(
      (await stripePost(stripeRequest(stripeEvent("checkout.session.completed", session)))).status,
      200,
    );
    const object = {
      id: `${kind === "refund" ? "re" : "dp"}_${crypto.randomUUID()}`,
      payment_intent: session.payment_intent,
      amount: 200,
      currency: "cad",
      status: kind === "refund" ? "succeeded" : "needs_response",
      metadata: {},
    };
    if (kind === "refund") refunds.set(object.id, object);
    const event = stripeEvent(
      kind === "refund" ? "refund.updated" : "charge.dispute.created",
      object,
    );
    for (let attempt = 0; attempt < 2; attempt++)
      assert.equal((await stripePost(stripeRequest(event))).status, 200);
    assert.ok((await wallet(userId)).blocked);
    assert.equal((await wallet(userId)).available, 1000);
    assert.equal(await ledgerCount(userId), 1);
  }
});

async function smsDelivery({ start = true } = {}) {
  const userId = await fixture.createMember();
  const phone = `+141655501${String(phoneSequence++).padStart(2, "0")}`;
  await fixture.repo.mutateMember(userId, 1, {
    type: "onboarding",
    source: "bible",
    topics: [],
    channel: "sms",
    timezone: "America/Toronto",
    schedule: {
      mode: "fixed",
      times: ["08:00"],
      days: [0, 1, 2, 3, 4, 5, 6],
      windowStart: "09:00",
      windowEnd: "17:00",
      paused: false,
    },
  });
  const hash = tokens.digestIdentifier(destinationSecret, `sms:${phone}`);
  await fixture.repo.upsertContact(userId, "sms", phone, true, hash);
  await fixture.repo.setConsent(userId, "sms", true, consentVersion("sms", 10));
  const intent = await fixture.repo.createCheckout(userId, 100, crypto.randomUUID());
  await fixture.repo.fundCheckout({
    checkoutId: intent.id,
    providerSessionId: `cs_${intent.id}`,
    paymentIntentId: `pi_${intent.id}`,
    amountCents: 100,
    currency: "cad",
    eventId: crypto.randomUUID(),
  });
  const id = await store.enqueue({
    userId,
    occurrenceKey: crypto.randomUUID(),
    channel: "sms",
    practiceId: "notice-your-neighbour",
    contentVersion: "v1",
    profileVersion: (await fixture.repo.getState(userId)).profile.deliveryVersion,
    context: await store.context(userId, "sms"),
    payload: {
      to: phone,
      localDate: "2026-10-21",
      quoteCents: 10,
      rateCents: 10,
      segments: 1,
      body: "A synthetic practice with a reference.",
    },
    scheduledAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 600000),
  });
  assert.ok(id);
  if (start) {
    const claim = (await store.claim(25)).find((row) => row.id === id);
    assert.ok(claim);
    assert.ok(await store.begin(id, claim.claimToken, 10));
  }
  return { userId, phone, id, hash, sid: `SM${crypto.randomBytes(16).toString("hex")}` };
}
function twilioRequest(path, fields, { signature, raw, requestPath = path } = {}) {
  const parameters = { AccountSid: twilioConfig.accountSid, ...fields };
  return new Request(`${origin}${requestPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature":
        signature ??
        twilioSdk.getExpectedTwilioSignature(
          twilioConfig.authToken,
          `${origin}${path}`,
          parameters,
        ),
    },
    body: raw ?? new URLSearchParams(parameters).toString(),
  });
}
const statusPath = (id) => `/api/webhooks/twilio/status?deliveryId=${id}`;
const statusFields = (delivery, status) => ({
  MessageSid: delivery.sid,
  MessageStatus: status,
  To: delivery.phone,
});

test("Twilio delivered, duplicate and stale callbacks settle one reservation and acknowledge with empty 204", async () => {
  const delivery = await smsDelivery();
  for (const status of ["delivered", "delivered", "sent", "undelivered"]) {
    const response = await statusPost(
      twilioRequest(statusPath(delivery.id), statusFields(delivery, status)),
    );
    assert.equal(response.status, 204);
    assert.equal(response.body, null);
    assertHeaders(response);
  }
  assert.equal((await store.get(delivery.id)).status, "delivered");
  assert.deepEqual(await wallet(delivery.userId), { available: 90, reserved: 0, blocked: null });
  assert.equal(await ledgerCount(delivery.userId), 3);
});

test("Twilio wrong signatures, changed delivery query and wrong recipient cannot settle credit", async () => {
  const delivery = await smsDelivery();
  const path = statusPath(delivery.id);
  const fields = statusFields(delivery, "delivered");
  for (const request of [
    twilioRequest(path, fields, { signature: "invalid" }),
    twilioRequest(path, fields, { requestPath: statusPath(crypto.randomUUID()) }),
  ]) {
    const response = await statusPost(request);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_SIGNATURE");
  }
  assert.equal(
    (await statusPost(twilioRequest(path, { ...fields, To: "+14165550199" }))).status,
    204,
  );
  assert.deepEqual(await wallet(delivery.userId), { available: 90, reserved: 10, blocked: null });
  assert.equal((await statusPost(twilioRequest(path, fields))).status, 204);
  assert.equal((await wallet(delivery.userId)).reserved, 0);
});

test("Twilio terminal failure returns credit once and carrier opt-out withdraws consent", async () => {
  const delivery = await smsDelivery();
  const fields = { ...statusFields(delivery, "undelivered"), ErrorCode: "21610" };
  for (let attempt = 0; attempt < 2; attempt++)
    assert.equal((await statusPost(twilioRequest(statusPath(delivery.id), fields))).status, 204);
  assert.equal((await store.get(delivery.id)).status, "failed");
  assert.deepEqual(await wallet(delivery.userId), { available: 100, reserved: 0, blocked: null });
  assert.equal((await fixture.repo.getState(delivery.userId)).contacts[0].consentGranted, false);
  assert.equal(await ledgerCount(delivery.userId), 3);
});

test("Twilio inbound STOP is idempotent, cancels queued SMS, and START never restores product consent", async () => {
  const delivery = await smsDelivery({ start: false });
  const path = "/api/webhooks/twilio/inbound";
  const fields = {
    MessageSid: delivery.sid,
    From: delivery.phone,
    Body: " STOP ",
    OptOutType: "STOP",
  };
  const countConsents = async () =>
    (
      await fixture.sql.query(
        "select count(*)::int as total from app.consent_events where user_id=$1",
        [delivery.userId],
      )
    ).rows[0].total;
  const beforeCount = await countConsents();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await inboundPost(twilioRequest(path, fields));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/xml/);
    assert.equal(await response.text(), '<?xml version="1.0" encoding="UTF-8"?><Response/>');
    assertHeaders(response);
  }
  assert.equal(await countConsents(), beforeCount + 1);
  assert.equal((await store.get(delivery.id)).status, "cancelled");
  assert.equal((await fixture.repo.getState(delivery.userId)).contacts[0].consentGranted, false);
  assert.equal(
    (await inboundPost(twilioRequest(path, { ...fields, Body: "START", OptOutType: "START" })))
      .status,
    200,
  );
  assert.equal(
    (
      await fixture.sql.query(
        "select count(*)::int as total from app.suppressions where channel='sms' and destination_hash=$1",
        [delivery.hash],
      )
    ).rows[0].total,
    0,
  );
  assert.equal((await fixture.repo.getState(delivery.userId)).contacts[0].consentGranted, false);
  assert.equal(await store.context(delivery.userId, "sms"), null);
});

test("Twilio inbound validation rejects altered fields and START cannot clear a separate suppression", async () => {
  const delivery = await smsDelivery({ start: false });
  const path = "/api/webhooks/twilio/inbound";
  const fields = { From: delivery.phone, Body: "STOP", OptOutType: "STOP" };
  for (const request of [
    twilioRequest(path, fields, { signature: "invalid" }),
    twilioRequest(path, { ...fields, AccountSid: `AC${"f".repeat(32)}` }),
    twilioRequest(path, fields, {
      raw:
        new URLSearchParams({ AccountSid: twilioConfig.accountSid, ...fields }).toString() +
        "&Body=START",
    }),
  ]) {
    const response = await inboundPost(request);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_SIGNATURE");
  }
  assert.equal((await fixture.repo.getState(delivery.userId)).contacts[0].consentGranted, true);
  assert.equal((await store.get(delivery.id)).status, "queued");
  await fixture.repo.suppressDestination("sms", delivery.hash, "manual_review");
  assert.equal(
    (await inboundPost(twilioRequest(path, { ...fields, Body: "START", OptOutType: "START" })))
      .status,
    200,
  );
  assert.equal(
    (
      await fixture.sql.query(
        "select reason from app.suppressions where channel='sms' and destination_hash=$1",
        [delivery.hash],
      )
    ).rows[0].reason,
    "manual_review",
  );
  assert.equal(await store.context(delivery.userId, "sms"), null);
});
