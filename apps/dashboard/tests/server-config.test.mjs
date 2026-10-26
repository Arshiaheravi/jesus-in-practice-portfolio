import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

// Execute actual server configuration using a synthetic environment, never local credentials.
async function loadSource(relativePath, env, dependencies = { "server-only": {} }) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relativePath,
  });
  const loaded = { exports: {} };
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

test("application origins accept HTTPS and explicit HTTP loopback for local integrations", async () => {
  for (const value of [
    "https://member.example.test",
    "https://member.example.test/",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://[::1]:3001",
  ]) {
    const config = await loadSource("../lib/server/config.ts", { APP_ORIGIN: value });
    assert.equal(config.origin(), new URL(value).origin);
  }
});

test("invalid application origins fail with a safe configuration error", async () => {
  for (const value of [
    undefined,
    "not-a-url",
    "http://member.example.test",
    "ftp://localhost",
    "ws://127.0.0.1",
    "https://member.example.test/path",
    "https://member.example.test/?query=1",
    "https://member.example.test/#fragment",
    "https://fixture:fixture@member.example.test",
    "https://member.exa\nmple.test",
  ]) {
    const config = await loadSource("../lib/server/config.ts", { APP_ORIGIN: value });
    assert.throws(config.origin, (error) => {
      assert.equal(error.code, "UNAVAILABLE");
      assert.equal(error.status, 503);
      assert.equal(error.message, "Application origin needs configuration.");
      return true;
    });
  }
});

test("operator consent identity requires a configured support contact with no fallback", async () => {
  const env = {
    OPERATOR_NAME: "Fixture operator",
    OPERATOR_MAILING_ADDRESS: "Fixture address",
  };
  const config = await loadSource("../lib/server/config.ts", env);
  assert.equal(config.operatorConfigured(), false);
  assert.throws(config.operator, { code: "UNAVAILABLE", status: 503 });
  env.SUPPORT_EMAIL = "support@example.test";
  assert.equal(config.operatorConfigured(), true);
  assert.equal(config.operator().supportEmail, env.SUPPORT_EMAIL);
});

test("Resend construction uses only the adopter's support contact", async () => {
  const env = {
    SUPPORT_EMAIL: " support@example.test ",
    RESEND_API_KEY: "fixture-resend-key",
    RESEND_WEBHOOK_SECRET: "fixture-resend-signing-secret",
    EMAIL_FROM: "practice@example.test",
  };
  const config = await loadSource("../lib/server/config.ts", env);
  let captured;
  const providers = await loadSource("../lib/server/providers.ts", env, {
    "server-only": {},
    "./config": config,
    "@jesus-in-practice/backend/providers/resend": {
      createResendProvider(options) {
        captured = options;
        return { fixture: true };
      },
    },
    "@jesus-in-practice/backend/providers/stripe": {},
    "@jesus-in-practice/backend/providers/twilio": {},
  });
  assert.deepEqual(providers.resend(), { fixture: true });
  assert.equal(captured.replyTo, "support@example.test");
  delete env.SUPPORT_EMAIL;
  captured = undefined;
  assert.throws(providers.resend, { code: "UNAVAILABLE", status: 503 });
  assert.equal(captured, undefined, "Missing operator contact never reaches the provider adapter.");
});
