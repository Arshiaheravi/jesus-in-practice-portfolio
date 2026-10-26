// Injected request mocks only; webhook signatures are local fixtures.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createResendProvider } from "../src/providers/resend.ts";

const secret = Buffer.from("local-test-secret-not-a-real-webhook-key");
const config = {
  apiKey: "re_fixture",
  webhookSecret: `whsec_${secret.toString("base64")}`,
  from: "Jesus in Practice <lessons@example.test>",
  replyTo: "support@example.test",
};
const message = {
  deliveryId: "delivery-fixture",
  to: "recipient@example.test",
  subject: "Practice",
  html: "<p>Practice</p>",
  text: "Practice",
  unsubscribeUrl: "https://app.example.test/unsubscribe?t=opaque",
};

test("Resend fixes sender, one recipient and keyed immutable lesson payload", async () => {
  let observed;
  const provider = createResendProvider(config, {
    send: async (...args) => {
      observed = args;
      return { data: { id: "email-fixture" }, error: null };
    },
  });
  assert.deepEqual(await provider.send(message), {
    outcome: "accepted",
    providerId: "email-fixture",
    status: "accepted",
  });
  assert.equal(observed[0].from, config.from);
  assert.deepEqual(observed[0].to, [message.to]);
  assert.equal(observed[0].replyTo, config.replyTo);
  assert.equal(observed[0].headers["List-Unsubscribe"], `<${message.unsubscribeUrl}>`);
  assert.equal(observed[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(observed[1].idempotencyKey, "lesson/delivery-fixture");
  assert.ok(observed[1].signal instanceof AbortSignal);
});

test("Resend distinguishes definite rejection from transport and concurrent-key uncertainty", async () => {
  for (const [error, outcome, code] of [
    [{ statusCode: 400, name: "validation_error" }, "rejected", "RESEND_REJECTED"],
    [{ statusCode: 429, name: "rate_limit_exceeded" }, "rejected", "RESEND_RATE_LIMIT"],
    [{ statusCode: 500, name: "internal_server_error" }, "unknown", "RESEND_UNCERTAIN"],
    [{ statusCode: 409, name: "concurrent_idempotent_requests" }, "unknown", "RESEND_IN_PROGRESS"],
    [
      { statusCode: 409, name: "invalid_idempotent_request" },
      "rejected",
      "RESEND_IDEMPOTENCY_CONFLICT",
    ],
  ]) {
    const provider = createResendProvider(config, { send: async () => ({ data: null, error }) });
    const result = await provider.send(message);
    assert.equal(result.outcome, outcome);
    assert.equal(result.code, code);
  }
  let calls = 0;
  const timedOut = createResendProvider(
    { ...config, timeoutMs: 5 },
    {
      send: () => {
        calls++;
        return new Promise(() => {});
      },
    },
  );
  assert.deepEqual(await timedOut.send(message), { outcome: "unknown", code: "RESEND_TIMEOUT" });
  assert.equal(calls, 1);
});

test("invalid destination/header rejected before any email request", async () => {
  let calls = 0;
  const provider = createResendProvider(config, {
    send: async () => {
      calls++;
      throw new Error("must not call");
    },
  });
  assert.equal(
    (await provider.send({ ...message, to: "a@example.test, b@example.test" })).outcome,
    "rejected",
  );
  assert.equal(
    (await provider.send({ ...message, subject: "Hello\r\nBcc: other@example.test" })).outcome,
    "rejected",
  );
  assert.equal(calls, 0);
});

test("Resend SDK verifies exact signed payload and freshness", () => {
  const provider = createResendProvider(config, {
    send: async () => {
      throw new Error("no request");
    },
  });
  const payload = JSON.stringify({
    type: "email.bounced",
    created_at: "2026-01-01T00:00:00Z",
    data: { email_id: "email-fixture" },
  });
  const sign = (body, timestamp = String(Math.floor(Date.now() / 1000))) => {
    const id = "msg_fixture";
    const signature =
      "v1," + createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
    return { id, timestamp, signature };
  };
  assert.equal(provider.verifyWebhook(payload, sign(payload)).type, "email.bounced");
  assert.throws(() => provider.verifyWebhook(payload + " ", sign(payload)), /verification failed/);
  assert.throws(() => provider.verifyWebhook(payload, sign(payload, "1")), /verification failed/);
});
