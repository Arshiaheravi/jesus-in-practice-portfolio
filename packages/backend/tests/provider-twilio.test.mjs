// No Twilio network calls. Request ports and destinations are local test fixtures.
import assert from "node:assert/strict";
import test from "node:test";
import twilio from "twilio";
import { createTwilioProvider } from "../src/providers/twilio.ts";

const phone = "+14165550100";
const sid = "SM" + "a".repeat(32);
const config = {
  accountSid: "AC" + "a".repeat(32),
  apiKeySid: "SK" + "b".repeat(32),
  apiKeySecret: "fixture",
  authToken: "fixture-signing-token",
  verifyServiceSid: "VA" + "c".repeat(32),
  messagingServiceSid: "MG" + "d".repeat(32),
  publicWebhookBaseUrl: "https://app.example.test",
};
const port = (overrides = {}) => ({
  lookupPhone: async () => ({ valid: true, countryCode: "CA", phoneNumber: phone }),
  startVerification: async () => ({ sid: "VEfixture", to: phone, status: "pending" }),
  checkVerification: async () => ({ sid: "VEfixture", to: phone, status: "approved" }),
  sendMessage: async () => ({ sid, status: "queued" }),
  getMessage: async () => ({
    sid,
    status: "delivered",
    numSegments: "3",
    price: "-0.04",
    priceUnit: "USD",
  }),
  ...overrides,
});

test("Lookup enforces CA rather than assuming the shared +1 country code", async () => {
  const provider = createTwilioProvider(config, port());
  assert.deepEqual(await provider.lookupCanadianPhone(phone), { valid: true, phone });
  assert.equal((await provider.lookupCanadianPhone("+442071234567")).valid, false);
  for (const patch of [{ countryCode: "US" }, { valid: false }, { phoneNumber: "+14165550101" }]) {
    const invalid = createTwilioProvider(
      config,
      port({
        lookupPhone: async () => ({ valid: true, countryCode: "CA", phoneNumber: phone, ...patch }),
      }),
    );
    assert.equal((await invalid.lookupCanadianPhone(phone)).valid, false);
  }
});

test("Verify grants proof only for approved status and the matching destination", async () => {
  const provider = createTwilioProvider(config, port());
  assert.equal((await provider.startVerification(phone)).status, "pending");
  assert.equal((await provider.checkVerification(phone, "123456")).outcome, "approved");
  for (const [patch, expected] of [
    [{ status: "pending" }, "pending"],
    [{ status: "expired" }, "rejected"],
    [{ to: "+14165550101" }, "unknown"],
  ]) {
    const instance = createTwilioProvider(
      config,
      port({
        checkVerification: async () => ({
          sid: "VEfixture",
          status: "approved",
          to: phone,
          ...patch,
        }),
      }),
    );
    assert.equal((await instance.checkVerification(phone, "123456")).outcome, expected);
  }
  const expired = createTwilioProvider(
    config,
    port({
      checkVerification: async () => {
        throw { status: 404 };
      },
    }),
  );
  assert.equal(
    (await expired.checkVerification(phone, "123456")).code,
    "VERIFY_EXPIRED_OR_UNAVAILABLE",
  );
  assert.equal((await provider.checkVerification(phone, "not-a-code")).outcome, "rejected");
});

test("SMS acceptance records provider status and callback has only an opaque delivery ID", async () => {
  let parameters;
  const provider = createTwilioProvider(
    config,
    port({
      sendMessage: async (input) => {
        parameters = input;
        return { sid, status: "queued" };
      },
    }),
  );
  assert.deepEqual(
    await provider.sendSms({
      deliveryId: "delivery-fixture",
      to: phone,
      body: "Practice. STOP to unsubscribe.",
    }),
    { outcome: "accepted", providerId: sid, status: "queued" },
  );
  const callback = new URL(parameters.statusCallback);
  assert.equal(callback.origin, config.publicWebhookBaseUrl);
  assert.equal(callback.pathname, "/api/webhooks/twilio/status");
  assert.deepEqual([...callback.searchParams], [["deliveryId", "delivery-fixture"]]);
  assert.equal(parameters.validityPeriod, 300);
  assert.equal(parameters.messagingServiceSid, config.messagingServiceSid);
});

test("SMS timeout has no automatic resend; STOP and rate limits remain distinct", async () => {
  let calls = 0;
  const provider = createTwilioProvider(
    { ...config, timeoutMs: 5 },
    port({
      sendMessage: () => {
        calls++;
        return new Promise(() => {});
      },
    }),
  );
  const message = { deliveryId: "delivery-fixture", to: phone, body: "Practice" };
  assert.deepEqual(await provider.sendSms(message), { outcome: "unknown", code: "TWILIO_TIMEOUT" });
  assert.equal(calls, 1);
  assert.deepEqual(await provider.sendSms({ ...message, body: "漢".repeat(701) }), {
    outcome: "rejected",
    code: "SMS_SEGMENT_LIMIT",
    retryable: false,
  });
  assert.equal(calls, 1);
  for (const [error, expected] of [
    [{ status: 400, code: 21610 }, "TWILIO_OPTED_OUT"],
    [{ status: 429 }, "TWILIO_RATE_LIMIT"],
    [{ status: 500 }, "TWILIO_UNCERTAIN"],
  ]) {
    const failed = createTwilioProvider(
      config,
      port({
        sendMessage: async () => {
          throw error;
        },
      }),
    );
    assert.equal((await failed.sendSms(message)).code, expected);
  }
});

test("Twilio SDK validates trusted full callback URL, raw fields and account", () => {
  const provider = createTwilioProvider(config, port());
  const url = `${config.publicWebhookBaseUrl}/api/webhooks/twilio/status?deliveryId=delivery-fixture`;
  const fields = { AccountSid: config.accountSid, MessageSid: sid, MessageStatus: "delivered" };
  const rawBody = new URLSearchParams(fields).toString();
  const signature = twilio.getExpectedTwilioSignature(config.authToken, url, fields);
  assert.equal(provider.verifyWebhook({ url, rawBody, signature }).MessageSid, sid);
  assert.throws(
    () => provider.verifyWebhook({ url, rawBody: rawBody + "&MessageStatus=failed", signature }),
    /verification failed/,
  );
  assert.throws(
    () =>
      provider.verifyWebhook({
        url: url.replace("delivery-fixture", "another-delivery"),
        rawBody,
        signature,
      }),
    /verification failed/,
  );
  assert.throws(
    () =>
      provider.verifyWebhook({
        url: url.replace("app.example.test", "attacker.example.test"),
        rawBody,
        signature,
      }),
    /verification failed/,
  );
  const wrongAccount = { ...fields, AccountSid: "AC" + "f".repeat(32) };
  assert.throws(
    () =>
      provider.verifyWebhook({
        url,
        rawBody: new URLSearchParams(wrongAccount).toString(),
        signature: twilio.getExpectedTwilioSignature(config.authToken, url, wrongAccount),
      }),
    /verification failed/,
  );
});

test("message reconciliation returns provider units without pretending USD is CAD", async () => {
  const provider = createTwilioProvider(config, port());
  assert.equal((await provider.getMessage(sid)).priceUnit, "USD");
  await assert.rejects(provider.getMessage("not-a-message"), /identifier/);
});
