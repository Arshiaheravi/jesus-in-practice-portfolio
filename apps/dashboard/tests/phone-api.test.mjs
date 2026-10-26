import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, before, beforeEach, test } from "node:test";

import * as tokens from "../../../packages/backend/src/tokens.ts";
import * as validation from "../../../packages/backend/src/validation.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const origin = "https://member.example.test";
const userId = "11111111-1111-4111-8111-111111111111";
const phone = "+14165550123";
const challengeId = `VE${"a".repeat(32)}`;
const environment = {
  NEXT_PUBLIC_APP_MODE: "live",
  APP_ORIGIN: origin,
  ENABLE_PHONE_VERIFICATION: "true",
  DESTINATION_HASH_SECRET: "isolated-phone-route-fixture-secret-only",
  TWILIO_ACCOUNT_SID: "fixture-account",
  TWILIO_API_KEY_SID: "fixture-api-key",
  TWILIO_API_KEY_SECRET: "fixture-api-secret",
  TWILIO_AUTH_TOKEN: "fixture-auth-token",
  TWILIO_VERIFY_SERVICE_SID: "fixture-verify",
  TWILIO_MESSAGING_SERVICE_SID: "fixture-messaging",
};
let previous;
let calls;
let challenge;
let contacts;
let verificationResult;
let start;
let verify;

// Actual route, validation, configuration and HTTP wrapper. Identity, provider and repository
// boundaries are isolated fixtures: these tests make no provider or database request.
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
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected boundary: ${name}`);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

before(async () => {
  const config = await loadSource("../lib/server/config.ts", { "server-only": {} });
  const http = await loadSource("../lib/server/http.ts", {
    "server-only": {},
    "node:crypto": crypto,
    "next/server": require("next/server"),
    "./config": config,
  });
  const dependencies = {
    "@jesus-in-practice/backend/tokens": tokens,
    "@jesus-in-practice/backend/validation": validation,
    "@/lib/server/auth": { requireUser: async () => ({ id: userId }) },
    "@/lib/server/config": config,
    "@/lib/server/http": http,
    "@/lib/server/providers": {
      twilio() {
        calls.push("provider");
        return {
          async lookupCanadianPhone(value) {
            assert.equal(value, phone);
            calls.push("lookup");
            return { valid: true, phone };
          },
          async startVerification(value) {
            assert.equal(value, phone);
            calls.push("start");
            return { outcome: "accepted", providerId: challengeId };
          },
          async checkVerification(value, code) {
            assert.equal(value, phone);
            assert.equal(code, "123456");
            calls.push("verify");
            return verificationResult;
          },
        };
      },
    },
    "@/lib/server/runtime": {
      async rateLimit() {
        calls.push("rate-limit");
      },
      repository() {
        calls.push("repository");
        return {
          async getPhoneChallenge(id) {
            assert.equal(id, userId);
            calls.push("read-challenge");
            return challenge;
          },
          async setPhoneChallenge(id, value) {
            assert.equal(id, userId);
            calls.push("save-challenge");
            challenge = value;
          },
          async completePhoneChallenge(id, expected, hash) {
            assert.equal(id, userId);
            assert.equal(expected, challenge.challengeId);
            calls.push("complete-challenge");
            contacts.push({ phone: challenge.phone, destinationHash: hash });
            challenge = null;
          },
        };
      },
    },
  };
  start = (await loadSource("../app/api/phone/start/route.ts", dependencies)).POST;
  verify = (await loadSource("../app/api/phone/verify/route.ts", dependencies)).POST;
});
beforeEach(() => {
  previous = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  calls = [];
  contacts = [];
  verificationResult = { outcome: "approved", phone, providerId: challengeId };
  challenge = {
    phone,
    challengeId,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
});
afterEach(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function request(action) {
  return new Request(`${origin}/api/phone/${action}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(action === "start" ? { phone } : { code: "123456" }),
  });
}

for (const action of ["start", "verify"]) {
  test(`disabled phone ${action} preserves pending verification without provider or repository work`, async () => {
    process.env.ENABLE_PHONE_VERIFICATION = "false";
    const pending = structuredClone(challenge);
    const response = await (action === "start" ? start : verify)(request(action));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "UNAVAILABLE");
    assert.deepEqual(calls, []);
    assert.deepEqual(challenge, pending);
    assert.deepEqual(contacts, []);
  });

  test(`phone ${action} with incomplete credentials fails before provider or repository work`, async () => {
    process.env.TWILIO_API_KEY_SECRET = " \t ";
    const pending = structuredClone(challenge);
    const response = await (action === "start" ? start : verify)(request(action));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "UNAVAILABLE");
    assert.deepEqual(calls, []);
    assert.deepEqual(challenge, pending);
    assert.deepEqual(contacts, []);
  });
}

test("configured phone start retains the accepted provider challenge", async () => {
  challenge = null;
  const response = await start(request("start"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.deepEqual(calls, [
    "rate-limit",
    "rate-limit",
    "rate-limit",
    "provider",
    "lookup",
    "start",
    "repository",
    "save-challenge",
  ]);
  assert.equal(challenge.phone, phone);
  assert.equal(challenge.challengeId, challengeId);
  assert.ok(Date.parse(challenge.expiresAt) > Date.now());
  assert.deepEqual(contacts, []);
});

test("configured phone verify completes only the provider-approved pending challenge", async () => {
  const response = await verify(request("verify"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, [
    "rate-limit",
    "repository",
    "read-challenge",
    "provider",
    "verify",
    "complete-challenge",
  ]);
  assert.equal(challenge, null);
  assert.deepEqual(contacts, [
    {
      phone,
      destinationHash: tokens.digestIdentifier(environment.DESTINATION_HASH_SECRET, `sms:${phone}`),
    },
  ]);
});

test("phone provider uncertainty and service errors preserve the challenge without blaming the code", async () => {
  const pending = structuredClone(challenge);
  for (const result of [
    { outcome: "unknown", code: "VERIFY_TIMEOUT" },
    { outcome: "unknown", code: "VERIFY_UNCERTAIN" },
    { outcome: "unknown", code: "VERIFY_DESTINATION_MISMATCH" },
    { outcome: "rejected", code: "VERIFY_RATE_LIMIT", retryable: true },
    { outcome: "rejected", code: "VERIFY_REJECTED", retryable: false },
  ]) {
    calls = [];
    verificationResult = result;
    const response = await verify(request("verify"));
    assert.equal(response.status, 503, result.code);
    const data = await response.json();
    assert.equal(data.error.code, "UNAVAILABLE", result.code);
    assert.doesNotMatch(data.error.message, /incorrect|expired/);
    assert.ok(!calls.includes("complete-challenge"));
    assert.deepEqual(challenge, pending);
    assert.deepEqual(contacts, []);
  }
});

test("incorrect or expired phone codes and a different challenge cannot verify a contact", async () => {
  const pending = structuredClone(challenge);
  for (const result of [
    { outcome: "pending", code: "VERIFY_CODE_INCORRECT" },
    { outcome: "rejected", code: "VERIFY_EXPIRED_OR_REJECTED", retryable: false },
    { outcome: "rejected", code: "VERIFY_EXPIRED_OR_UNAVAILABLE", retryable: false },
    { outcome: "approved", phone, providerId: `VE${"b".repeat(32)}` },
  ]) {
    calls = [];
    verificationResult = result;
    const response = await verify(request("verify"));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_CODE");
    assert.ok(!calls.includes("complete-challenge"));
    assert.deepEqual(challenge, pending);
    assert.deepEqual(contacts, []);
  }
});

test("a phone verification can complete after a transient provider failure using the same challenge", async () => {
  const pending = structuredClone(challenge);
  verificationResult = { outcome: "unknown", code: "VERIFY_TIMEOUT" };
  assert.equal((await verify(request("verify"))).status, 503);
  assert.deepEqual(challenge, pending);
  verificationResult = { outcome: "approved", phone, providerId: challengeId };
  const response = await verify(request("verify"));
  assert.equal(response.status, 200);
  assert.equal(challenge, null);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, phone);
  assert.equal(calls.filter((call) => call === "complete-challenge").length, 1);
});
