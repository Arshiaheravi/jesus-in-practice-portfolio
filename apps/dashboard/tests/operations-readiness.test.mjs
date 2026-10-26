import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

async function loadSource(relativePath, dependencies, env) {
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
  // Execute actual modules with closed boundaries and an isolated process environment.
  new Function("require", "module", "exports", "process", outputText)(
    (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected boundary: ${name}`);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
    { env },
  );
  return loaded.exports;
}

async function readinessOptions(env = {}) {
  const fixtureDatabase = {};
  let captured;
  const dependencies = {
    "server-only": {},
    "node:crypto": { randomUUID: () => assert.fail("No job should start during readiness.") },
    "@jesus-in-practice/backend/financial-operations": {},
    "@jesus-in-practice/backend/maintenance": {
      parseRetentionPolicy() {
        throw new Error("No approved retention policy in this isolated test.");
      },
      inspectReadiness(database, options) {
        assert.equal(database, fixtureDatabase);
        captured = options;
        return { ready: false };
      },
    },
    "./config": await loadSource("../lib/server/config.ts", { "server-only": {} }, env),
    "./providers": { stripe: () => assert.fail("No provider should be constructed.") },
    "./runtime": { database: () => fixtureDatabase },
  };
  const operations = await loadSource("../lib/server/operations.ts", dependencies, env);
  assert.deepEqual(await operations.serviceReadiness(), { ready: false });
  return captured;
}

test("service readiness requires every checked-in migration without contacting providers or a database", async () => {
  const captured = await readinessOptions();
  const migrations = (await readdir(new URL("../../../database/migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(migrations.length > 0);
  assert.deepEqual(captured.expectedMigrations.map(({ name }) => name).sort(), migrations);
});

const configured = {
  OPERATOR_NAME: "Fixture operator",
  OPERATOR_MAILING_ADDRESS: "Fixture mailing address",
  SUPPORT_EMAIL: "support@example.test",
  MONITORING_SECRET: "m".repeat(32),
};

test("service readiness rejects whitespace-only operator identity", async () => {
  for (const name of ["OPERATOR_NAME", "OPERATOR_MAILING_ADDRESS", "SUPPORT_EMAIL"]) {
    const result = await readinessOptions({ ...configured, [name]: " \t\n " });
    assert.equal(result.configuration.operatorIdentity, false, `${name} needs a non-empty value`);
    assert.equal(result.configuration.monitoringSecret, true);
  }
});

test("service readiness measures the effective monitoring secret after trimming", async () => {
  for (const value of [" ".repeat(32), ` \t${"m".repeat(31)}\n `]) {
    const result = await readinessOptions({ ...configured, MONITORING_SECRET: value });
    assert.equal(result.configuration.monitoringSecret, false);
    assert.equal(result.configuration.operatorIdentity, true);
    assert.equal(JSON.stringify(result).includes(value), false);
  }
});

test("service readiness accepts padded configured identity and secret without exposing values", async () => {
  const result = await readinessOptions(
    Object.fromEntries(Object.entries(configured).map(([name, value]) => [name, ` \t${value}\n `])),
  );
  assert.equal(result.configuration.operatorIdentity, true);
  assert.equal(result.configuration.monitoringSecret, true);
  for (const value of Object.values(configured))
    assert.equal(JSON.stringify(result).includes(value), false);
});

const phoneSettings = {
  TWILIO_ACCOUNT_SID: "fixture-account",
  TWILIO_API_KEY_SID: "fixture-api-key",
  TWILIO_API_KEY_SECRET: "fixture-api-secret",
  TWILIO_AUTH_TOKEN: "fixture-auth-token",
  TWILIO_VERIFY_SERVICE_SID: "fixture-verify",
  TWILIO_MESSAGING_SERVICE_SID: "fixture-messaging",
};
const paymentSettings = {
  STRIPE_SECRET_KEY: "rk_test_syntheticFixture123",
  STRIPE_WEBHOOK_SECRET: "synthetic-webhook-secret",
  SMS_SEGMENT_PRICE_CAD_CENTS: "5",
  COMMERCE_POLICY_APPROVED: "true",
};
const enabled = {
  ...configured,
  ...phoneSettings,
  ...paymentSettings,
  NEXT_PUBLIC_APP_MODE: "live",
  ENABLE_PHONE_VERIFICATION: "true",
  ENABLE_PAYMENTS: "true",
};

test("intentionally disabled phone verification and payments do not require provider settings", async () => {
  for (const flags of [{}, { ENABLE_PHONE_VERIFICATION: "false", ENABLE_PAYMENTS: "false" }]) {
    const result = await readinessOptions({
      ...configured,
      NEXT_PUBLIC_APP_MODE: "live",
      ...flags,
    });
    assert.equal(result.configuration.phoneVerificationConfiguration, true);
    assert.equal(result.configuration.paymentConfiguration, true);
    assert.equal(result.deliveryEnabled, false);
  }
});

test("enabled phone verification fails readiness for every absent or whitespace-only credential", async () => {
  for (const key of Object.keys(phoneSettings)) {
    for (const value of [undefined, " \t\n "]) {
      const result = await readinessOptions({ ...enabled, [key]: value });
      assert.equal(result.configuration.phoneVerificationConfiguration, false, key);
      assert.equal(result.configuration.paymentConfiguration, true);
      assert.equal(result.deliveryEnabled, false);
    }
  }
});

test("enabled payment readiness respects credentials, operator identity, pricing and commerce approval", async () => {
  for (const key of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "OPERATOR_NAME",
    "OPERATOR_MAILING_ADDRESS",
    "SUPPORT_EMAIL",
  ]) {
    for (const value of [undefined, " \t\n "]) {
      const result = await readinessOptions({ ...enabled, [key]: value });
      assert.equal(result.configuration.paymentConfiguration, false, key);
      assert.equal(result.configuration.phoneVerificationConfiguration, true);
    }
  }
  for (const settings of [
    { SMS_SEGMENT_PRICE_CAD_CENTS: "0" },
    { SMS_SEGMENT_PRICE_CAD_CENTS: "1.5" },
    { COMMERCE_POLICY_APPROVED: "false" },
  ]) {
    const result = await readinessOptions({ ...enabled, ...settings });
    assert.equal(result.configuration.paymentConfiguration, false);
    assert.equal(result.configuration.phoneVerificationConfiguration, true);
  }
});

test("configured capabilities use trimmed settings without implying production provider approval", async () => {
  for (const liveMode of [false, true]) {
    const settings = {
      ...enabled,
      STRIPE_LIVE_MODE: String(liveMode),
      STRIPE_SECRET_KEY: `rk_${liveMode ? "live" : "test"}_syntheticFixture123`,
    };
    for (const key of [...Object.keys(phoneSettings), "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])
      settings[key] = ` \t${settings[key]}\n `;
    const result = await readinessOptions(settings);
    assert.equal(result.configuration.phoneVerificationConfiguration, true);
    assert.equal(result.configuration.paymentConfiguration, true);
    assert.equal(result.deliveryEnabled, false);
    for (const key of [...Object.keys(phoneSettings), "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])
      assert.equal(JSON.stringify(result).includes(settings[key].trim()), false);
  }
  // Production mode/key matching and provider approval are separate release checks.
});

test("preview cannot report enabled phone verification or payments as configured", async () => {
  const result = await readinessOptions({ ...enabled, NEXT_PUBLIC_APP_MODE: "preview" });
  assert.equal(result.configuration.phoneVerificationConfiguration, false);
  assert.equal(result.configuration.paymentConfiguration, false);
});
