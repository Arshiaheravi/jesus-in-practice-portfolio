import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, before, beforeEach, test } from "node:test";

import * as contracts from "../../../packages/backend/src/contracts.ts";
import * as tokens from "../../../packages/backend/src/tokens.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const settings = {
  NEXT_PUBLIC_APP_MODE: "live",
  DESTINATION_HASH_SECRET: "isolated-capabilities-fixture-secret-only",
  OPERATOR_NAME: "Fixture operator",
  OPERATOR_MAILING_ADDRESS: "Fixture address, not for sending",
  SUPPORT_EMAIL: "support@example.test",
  ENABLE_EMAIL_DELIVERY: "false",
  ENABLE_SMS_DELIVERY: "false",
  ENABLE_PHONE_VERIFICATION: "false",
  ENABLE_PAYMENTS: "false",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  SMS_SEGMENT_PRICE_CAD_CENTS: "5",
  COMMERCE_POLICY_APPROVED: "false",
  RESEND_API_KEY: "fixture-resend",
  RESEND_WEBHOOK_SECRET: "fixture-resend-webhook",
  EMAIL_FROM: "practice@example.test",
  TWILIO_ACCOUNT_SID: "fixture-account",
  TWILIO_API_KEY_SID: "fixture-api-key",
  TWILIO_API_KEY_SECRET: "fixture-api-secret",
  TWILIO_AUTH_TOKEN: "fixture-auth-token",
  TWILIO_VERIFY_SERVICE_SID: "fixture-verify",
  TWILIO_MESSAGING_SERVICE_SID: "fixture-messaging",
};
let previous;
let bootstrap;

// Actual config/bootstrap source; only the database boundary is a local fixture.
// No provider SDK, authenticated browser, database or external service is contacted.
async function loadSource(relativePath, dependencies) {
  const input = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(input, {
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
  ({ bootstrap } = await loadSource("../lib/server/member.ts", {
    "server-only": {},
    "@jesus-in-practice/backend/contracts": contracts,
    "@jesus-in-practice/backend/tokens": tokens,
    "./config": config,
    "./runtime": {
      repository: () => ({
        async ensureProfile() {},
        async upsertContact() {},
        async getState() {
          return {
            profile: {
              version: 1,
              preferences: contracts.defaultPreferences,
              schedule: contracts.defaultSchedule,
            },
            contacts: [],
            saved: [],
            notes: {},
            completions: { items: [], total: 0, hasMore: false, nextCursor: null },
            wallet: {
              id: "11111111-1111-4111-8111-111111111111",
              availableCents: 0,
              reservedCents: 0,
              blockedReason: null,
            },
          };
        },
      }),
    },
  }));
});
beforeEach(() => {
  previous = new Map(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
});
afterEach(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const member = () =>
  bootstrap({ id: "22222222-2222-4222-8222-222222222222", email: "reader@example.test" });
const unavailable = { emailDelivery: false, smsDelivery: false, phoneVerification: false };

test("disabled capabilities remain unavailable even when provider settings exist", async () => {
  const result = await member();
  assert.deepEqual(result.capabilities, unavailable);
  assert.equal(result.wallet.enabled, false);
  for (const key of ["RESEND_API_KEY", "TWILIO_API_KEY_SECRET", "TWILIO_AUTH_TOKEN"]) {
    assert.equal(JSON.stringify(result).includes(settings[key]), false);
    assert.equal(JSON.stringify(result).includes(key), false);
  }
});

test("email, phone ownership and SMS delivery availability are independent", async () => {
  process.env.ENABLE_EMAIL_DELIVERY = "true";
  assert.deepEqual((await member()).capabilities, { ...unavailable, emailDelivery: true });
  process.env.ENABLE_PHONE_VERIFICATION = "true";
  assert.deepEqual((await member()).capabilities, {
    emailDelivery: true,
    phoneVerification: true,
    smsDelivery: false,
  });
  process.env.ENABLE_SMS_DELIVERY = "true";
  assert.equal((await member()).capabilities.smsDelivery, false);
  process.env.COMMERCE_POLICY_APPROVED = "true";
  assert.deepEqual((await member()).capabilities, {
    emailDelivery: true,
    smsDelivery: true,
    phoneVerification: true,
  });
  // A temporarily unavailable credential must not offer a provider action in the UI.
  process.env.TWILIO_AUTH_TOKEN = " ";
  assert.deepEqual((await member()).capabilities, { ...unavailable, emailDelivery: true });
});

test("delivery availability requires operator identity and SMS pricing", async () => {
  process.env.ENABLE_EMAIL_DELIVERY = "true";
  process.env.ENABLE_SMS_DELIVERY = "true";
  process.env.COMMERCE_POLICY_APPROVED = "true";
  process.env.SMS_SEGMENT_PRICE_CAD_CENTS = "";
  assert.deepEqual((await member()).capabilities, { ...unavailable, emailDelivery: true });
  process.env.OPERATOR_MAILING_ADDRESS = "";
  assert.deepEqual((await member()).capabilities, unavailable);
  process.env.OPERATOR_MAILING_ADDRESS = " ";
  assert.deepEqual((await member()).capabilities, unavailable);
});

test("member contact and paid messaging require the adopter's valid support email", async () => {
  process.env.ENABLE_EMAIL_DELIVERY = "true";
  process.env.ENABLE_SMS_DELIVERY = "true";
  process.env.ENABLE_PAYMENTS = "true";
  process.env.COMMERCE_POLICY_APPROVED = "true";
  process.env.STRIPE_SECRET_KEY = "fixture-stripe-server-key";
  process.env.STRIPE_WEBHOOK_SECRET = "fixture-stripe-webhook-secret";
  for (const contact of [undefined, "", " \t ", "not-an-email", "support\n@example.test"]) {
    if (contact === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = contact;
    const result = await member();
    assert.equal(result.operator, null);
    assert.equal(result.wallet.enabled, false);
    assert.deepEqual(result.capabilities, unavailable);
  }
  process.env.SUPPORT_EMAIL = " help@example.test ";
  const result = await member();
  assert.deepEqual(result.operator, {
    name: settings.OPERATOR_NAME,
    mailingAddress: settings.OPERATOR_MAILING_ADDRESS,
    supportEmail: "help@example.test",
  });
  assert.equal(result.wallet.enabled, true);
  assert.deepEqual(result.capabilities, {
    emailDelivery: true,
    smsDelivery: true,
    phoneVerification: false,
  });
});

const checkoutSettings = {
  STRIPE_SECRET_KEY: "fixture-stripe-server-key",
  STRIPE_WEBHOOK_SECRET: "fixture-stripe-webhook-secret",
  OPERATOR_NAME: settings.OPERATOR_NAME,
  OPERATOR_MAILING_ADDRESS: settings.OPERATOR_MAILING_ADDRESS,
  SUPPORT_EMAIL: settings.SUPPORT_EMAIL,
};

test("checkout availability rejects whitespace-only provider and operator settings", async () => {
  process.env.ENABLE_PAYMENTS = "true";
  process.env.COMMERCE_POLICY_APPROVED = "true";
  for (const name of Object.keys(checkoutSettings)) {
    Object.assign(process.env, checkoutSettings);
    process.env[name] = " \t\n ";
    assert.equal((await member()).wallet.enabled, false, `${name} needs a non-empty value`);
  }
});

test("checkout availability accepts configured values after trimming without exposing secrets", async () => {
  process.env.ENABLE_PAYMENTS = "true";
  process.env.COMMERCE_POLICY_APPROVED = "true";
  for (const [name, value] of Object.entries(checkoutSettings)) process.env[name] = ` \t${value}\n`;
  const result = await member();
  assert.equal(result.wallet.enabled, true);
  assert.deepEqual(result.capabilities, unavailable);
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    assert.equal(JSON.stringify(result).includes(name), false);
    assert.equal(JSON.stringify(result).includes(checkoutSettings[name]), false);
  }
});

test("preview never advertises live provider capabilities", async () => {
  process.env.NEXT_PUBLIC_APP_MODE = "preview";
  process.env.ENABLE_EMAIL_DELIVERY = "true";
  process.env.ENABLE_SMS_DELIVERY = "true";
  process.env.ENABLE_PHONE_VERIFICATION = "true";
  process.env.COMMERCE_POLICY_APPROVED = "true";
  assert.deepEqual((await member()).capabilities, unavailable);
});
