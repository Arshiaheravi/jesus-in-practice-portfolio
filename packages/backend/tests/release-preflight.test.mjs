import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../../scripts/release-preflight.mjs", import.meta.url));
const policy = {
  approvalReference: "synthetic-policy-fixture",
  approvedAt: "2026-01-01T00:00:00Z",
  expiredPhoneChallengeDays: 7,
  rateLimitDays: 2,
  terminalPayloadDays: 30,
  batchSize: 100,
};
function check(retention, overrides = {}) {
  const fixture = {
    APP_ORIGIN: "https://app.jip-test.invalid",
    NEXT_PUBLIC_SITE_URL: "https://www.jip-test.invalid",
    NEXT_PUBLIC_DASHBOARD_URL: "https://app.jip-test.invalid",
    NEXT_PUBLIC_APP_MODE: "live",
    SUPABASE_URL: "https://auth.jip-test.invalid",
    SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    DATABASE_URL: "postgresql://synthetic@db.jip-test.invalid/synthetic",
    OPERATOR_NAME: "Synthetic fixture operator",
    OPERATOR_MAILING_ADDRESS: "Synthetic fixture address",
    SUPPORT_EMAIL: "support@example.test",
    RATE_LIMIT_SECRET: "a".repeat(32),
    DESTINATION_HASH_SECRET: "b".repeat(32),
    UNSUBSCRIBE_SIGNING_SECRET: "c".repeat(32),
    CRON_SECRET: "d".repeat(32),
    MONITORING_SECRET: "e".repeat(32),
    ENABLE_RETENTION: "true",
    RETENTION_POLICY_JSON: retention,
    ...overrides,
  };
  const result = spawnSync(process.execPath, ["--experimental-strip-types", script], {
    env: fixture,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.error, undefined);
  return { exit: result.status, report: JSON.parse(result.stdout) };
}
test("release configuration accepts a valid synthetic policy without claiming provider verification", () => {
  const { exit, report } = check(JSON.stringify(policy));
  assert.equal(exit, 0);
  assert.equal(report.configurationReady, true);
  assert.match(report.note, /does not verify/);
});

test("release origins reject embedded controls before URL normalization", () => {
  const names = ["APP_ORIGIN", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_DASHBOARD_URL"];
  for (const value of [
    "https://app.jip-\ntest.invalid",
    "https://app.jip-\rtest.invalid",
    "https://app.jip-\ttest.invalid",
  ]) {
    const { exit, report } = check(
      JSON.stringify(policy),
      Object.fromEntries(names.map((name) => [name, value])),
    );
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(
      report.failures,
      names.map((name) => `${name} must be the approved HTTPS origin.`),
    );
  }
  const { exit, report } = check(
    JSON.stringify(policy),
    Object.fromEntries(names.map((name) => [name, " https://app.jip-test.invalid "])),
  );
  assert.equal(exit, 0);
  assert.deepEqual(report.failures, []);
});

test("release configuration requires an adopter-owned support contact without printing its value", () => {
  for (const value of [
    "",
    " \t ",
    "not-an-email",
    "support\n@example.test",
    `${"x".repeat(243)}@example.test`,
  ]) {
    const { exit, report } = check(JSON.stringify(policy), { SUPPORT_EMAIL: value });
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(report.failures, [
      value.trim()
        ? "SUPPORT_EMAIL must be a valid operator contact email address."
        : "Set SUPPORT_EMAIL.",
    ]);
    if (value.trim()) assert.equal(JSON.stringify(report).includes(value), false);
  }
  const { exit, report } = check(JSON.stringify(policy), {
    SUPPORT_EMAIL: " support@example.test ",
  });
  assert.equal(exit, 0);
  assert.deepEqual(report.failures, []);
});
test("release configuration refuses malformed, incomplete, future or active-quota-deleting retention policies", () => {
  for (const value of [
    "not-json",
    "{}",
    JSON.stringify({ ...policy, rateLimitDays: 1 }),
    JSON.stringify({ ...policy, approvedAt: "2999-01-01T00:00:00Z" }),
    JSON.stringify({ ...policy, unexpected: true }),
  ]) {
    const { exit, report } = check(value);
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(report.failures, [
      "RETENTION_POLICY_JSON must satisfy the approved maintenance policy schema.",
    ]);
  }
});

const applicationSecretNames = [
  "RATE_LIMIT_SECRET",
  "DESTINATION_HASH_SECRET",
  "UNSUBSCRIBE_SIGNING_SECRET",
  "CRON_SECRET",
  "MONITORING_SECRET",
];

test("release configuration validates application secret length after runtime trimming", () => {
  const shortSecret = "x".repeat(31);
  for (const name of applicationSecretNames) {
    const { exit, report } = check(JSON.stringify(policy), {
      [name]: ` \t${shortSecret}\n `,
    });
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(report.failures, [`${name} must contain at least 32 characters.`]);
    assert.equal(JSON.stringify(report).includes(shortSecret), false);
  }
});

test("release configuration rejects secrets that become equal after runtime trimming", () => {
  const duplicateSecret = "synthetic-duplicate-secret-value-only";
  for (const [first, second] of [
    ["CRON_SECRET", "MONITORING_SECRET"],
    ["RATE_LIMIT_SECRET", "UNSUBSCRIBE_SIGNING_SECRET"],
  ]) {
    const { exit, report } = check(JSON.stringify(policy), {
      [first]: ` ${duplicateSecret}`,
      [second]: `${duplicateSecret}\t\n`,
    });
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(report.failures, [
      "Use a different random value for each application secret.",
    ]);
    assert.equal(JSON.stringify(report).includes(duplicateSecret), false);
  }
});

test("release configuration accepts distinct effective secrets with surrounding whitespace", () => {
  const values = applicationSecretNames.map(
    (_, index) => `synthetic-distinct-application-secret-${index}`,
  );
  const overrides = Object.fromEntries(
    applicationSecretNames.map((name, index) => [name, `\t ${values[index]}\n`]),
  );
  const { exit, report } = check(JSON.stringify(policy), overrides);
  assert.equal(exit, 0);
  assert.equal(report.configurationReady, true);
  assert.deepEqual(report.failures, []);
  for (const value of values) assert.equal(JSON.stringify(report).includes(value), false);
});

const payments = {
  ENABLE_PAYMENTS: "true",
  STRIPE_LIVE_MODE: "true",
  STRIPE_SECRET_KEY: "rk_live_syntheticFixture123",
  STRIPE_WEBHOOK_SECRET: "synthetic-webhook-secret",
  SMS_SEGMENT_PRICE_CAD_CENTS: "10",
  COMMERCE_POLICY_APPROVED: "true",
};

test("production payment configuration accepts standard and restricted live server keys", () => {
  for (const key of ["sk_live_syntheticFixture123", "rk_live_syntheticFixture123"]) {
    const { exit, report } = check(JSON.stringify(policy), {
      ...payments,
      STRIPE_SECRET_KEY: key,
    });
    assert.equal(exit, 0);
    assert.equal(report.configurationReady, true);
    assert.deepEqual(report.failures, []);
    assert.match(report.note, /does not verify/);
  }
});

test("live Stripe configuration rejects test, public, empty and malformed server keys", () => {
  for (const key of [
    "sk_test_syntheticFixture123",
    "rk_test_syntheticFixture123",
    "pk_live_syntheticFixture123",
    "whsec_syntheticFixture123",
    "",
    "sk_live_",
    "rk_live_",
    " rk_live_syntheticFixture123",
    "sk_live_synthetic Fixture123",
    "rk_live_syntheticFixture123 ",
  ]) {
    const { exit, report } = check(JSON.stringify(policy), {
      STRIPE_LIVE_MODE: "true",
      STRIPE_SECRET_KEY: key,
    });
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(report.failures, [
      "STRIPE_LIVE_MODE requires a live-mode Stripe server key (sk_live_ or rk_live_).",
    ]);
  }
});

test("restricted live keys do not bypass payment mode, webhook, pricing or policy gates", () => {
  for (const [overrides, failure] of [
    [
      { STRIPE_LIVE_MODE: "false" },
      "Production payments require STRIPE_LIVE_MODE=true after staging checks.",
    ],
    [{ STRIPE_WEBHOOK_SECRET: "" }, "Set STRIPE_WEBHOOK_SECRET."],
    [
      { SMS_SEGMENT_PRICE_CAD_CENTS: "0" },
      "Approve SMS_SEGMENT_PRICE_CAD_CENTS (integer CAD cents per segment).",
    ],
    [
      { COMMERCE_POLICY_APPROVED: "false" },
      "Approve pricing, refunds and tax treatment before enabling SMS commerce.",
    ],
  ]) {
    const { exit, report } = check(JSON.stringify(policy), { ...payments, ...overrides });
    assert.equal(exit, 1);
    assert.equal(report.configurationReady, false);
    assert.deepEqual(report.failures, [failure]);
  }
});
