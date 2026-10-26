import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

import * as operatorRepository from "../../../packages/backend/src/operators.ts";
import { z } from "../../../packages/backend/src/validation.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const nextServer = require("next/server");
const origin = "https://member.example.test";
const userId = "11111111-1111-4111-8111-111111111111";
const factorId = "22222222-2222-4222-8222-222222222222";
const otherFactor = "33333333-3333-4333-8333-333333333333";
let config, http;
const previous = new Map();

// Actual application modules and backend role guard, with isolated Auth/SQL/provider boundaries.
// These tests do not verify a hosted Supabase session or enroll a real authenticator.
async function source(path, dependencies) {
  const input = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: path,
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module boundary: ${name}`);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
before(async () => {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_APP_MODE: "live", APP_ORIGIN: origin })) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  config = await source("../lib/server/config.ts", { "server-only": {} });
  http = await source("../lib/server/http.ts", {
    "server-only": {},
    "node:crypto": crypto,
    "next/server": nextServer,
    "./config": config,
  });
});
after(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function fixture() {
  const state = {
    user: { id: userId, email_confirmed_at: "2026-01-01T00:00:00Z" },
    userError: null,
    claims: {
      sub: userId,
      aal: "aal2",
      amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - 60 }],
    },
    claimsError: null,
    role: "admin",
    active: true,
    factors: { all: [], totp: [] },
    verifyError: null,
    calls: [],
  };
  const client = {
    auth: {
      async getUser() {
        state.calls.push(["getUser"]);
        return { data: { user: state.user }, error: state.userError };
      },
      async getClaims() {
        state.calls.push(["getClaims"]);
        return { data: { claims: state.claims }, error: state.claimsError };
      },
      mfa: {
        async listFactors() {
          state.calls.push(["listFactors"]);
          return { data: state.factors, error: null };
        },
        async unenroll(input) {
          state.calls.push(["unenroll", input]);
          return { error: null };
        },
        async enroll(input) {
          state.calls.push(["enroll", input]);
          return {
            data: { id: factorId, totp: { secret: "LOCAL_TEST_SECRET", qr_code: "<svg></svg>" } },
            error: null,
          };
        },
        async challengeAndVerify(input) {
          state.calls.push(["challengeAndVerify", input]);
          return { error: state.verifyError };
        },
      },
    },
  };
  const database = {
    async withService(task) {
      return task({
        async query(statement, parameters) {
          assert.match(statement, /app\.operator_roles/);
          assert.deepEqual(parameters, [userId]);
          state.calls.push(["role", parameters[0]]);
          return { rows: state.role && state.active ? [{ role: state.role }] : [] };
        },
      });
    },
  };
  const operator = await source("../lib/server/operator.ts", {
    "server-only": {},
    "@jesus-in-practice/backend/operators": operatorRepository,
    "./auth": { authClient: async () => client },
    "./config": config,
    "./runtime": { database: () => database },
  });
  const runtime = {
    async rateLimit(...args) {
      state.calls.push(["rateLimit", ...args]);
    },
  };
  const access = await source("../app/api/operator/access/route.ts", {
    "@jesus-in-practice/backend/validation": { z },
    "@/lib/server/config": config,
    "@/lib/server/http": http,
    "@/lib/server/operator": operator,
    "@/lib/server/runtime": runtime,
  });
  return { state, operator, access, runtime };
}
function post(body, headers = {}) {
  return new Request(`${origin}/api/operator/access`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("operator guard revalidates user, matching claims and current database role on each call", async () => {
  const { state, operator } = await fixture();
  const actor = await operator.requireOperator(["admin"], { recentMfa: true });
  assert.equal(actor.user.id, userId);
  assert.equal(actor.role, "admin");
  assert.equal(actor.recentMfa, true);
  assert.deepEqual(
    state.calls.map((row) => row[0]),
    ["getUser", "getClaims", "role"],
  );
  await operator.requireOperator();
  assert.equal(state.calls.filter((row) => row[0] === "getUser").length, 2);
  state.active = false;
  await assert.rejects(operator.requireOperator(), { code: "operator_required" });
});

test("unconfirmed users, Auth errors and mismatched claims never reach operator role access", async () => {
  const { state, operator } = await fixture();
  state.user.email_confirmed_at = null;
  await assert.rejects(operator.requireOperator(), { code: "AUTH_REQUIRED" });
  assert.deepEqual(
    state.calls.map((row) => row[0]),
    ["getUser"],
  );
  state.user.email_confirmed_at = "2026-01-01T00:00:00Z";
  state.userError = new Error("Auth unavailable");
  state.calls = [];
  await assert.rejects(operator.requireOperator(), { code: "AUTH_REQUIRED" });
  assert.deepEqual(
    state.calls.map((row) => row[0]),
    ["getUser"],
  );
  state.userError = null;
  state.claims.sub = otherFactor;
  state.calls = [];
  await assert.rejects(operator.requireOperator(), { code: "AUTH_REQUIRED" });
  assert.deepEqual(
    state.calls.map((row) => row[0]),
    ["getUser", "getClaims"],
  );
  state.claims.sub = userId;
  state.claimsError = new Error("Invalid claims");
  state.calls = [];
  await assert.rejects(operator.requireOperator(), { code: "AUTH_REQUIRED" });
  assert.ok(!state.calls.some((row) => row[0] === "role"));
});

test("role scope, AAL2 and recent authenticator evidence are independent required gates", async () => {
  const { state, operator } = await fixture();
  state.role = "support";
  await assert.rejects(operator.requireOperator(["admin"]), { code: "operator_required" });
  state.role = "admin";
  state.claims.aal = "aal1";
  await assert.rejects(operator.requireOperator(), { code: "MFA_REQUIRED" });
  assert.equal((await operator.requireOperator(undefined, { allowSetup: true })).verified, false);
  state.claims.aal = "aal2";
  for (const amr of [
    [],
    [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - 1800 }],
    [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) + 120 }],
    [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
    [{ method: "totp", timestamp: String(Math.floor(Date.now() / 1000)) }],
  ]) {
    state.claims.amr = amr;
    await assert.rejects(operator.requireOperator(["admin"], { recentMfa: true }), {
      code: "MFA_REQUIRED",
    });
  }
  assert.equal(
    (await operator.requireOperator(["admin"])).verified,
    true,
    "ordinary read access can use an older AAL2 session",
  );
});

test("operator POST uses the real same-origin JSON boundary before any Auth or MFA mutation", async () => {
  const { state, access } = await fixture();
  for (const headers of [
    { origin: "https://other.example.test" },
    { "sec-fetch-site": "cross-site" },
    { origin: "" },
  ]) {
    const response = await access.POST(post({ action: "enroll" }, headers));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "FORBIDDEN");
  }
  assert.equal(
    (await access.POST(post({ action: "enroll" }, { "content-type": "text/plain" }))).status,
    415,
  );
  assert.equal(state.calls.length, 0);
});

test("an existing verified authenticator cannot be replaced from setup access", async () => {
  const { state, access } = await fixture();
  state.claims.aal = "aal1";
  state.factors = {
    all: [{ id: factorId, factor_type: "totp", status: "verified" }],
    totp: [{ id: factorId, status: "verified" }],
  };
  const response = await access.POST(post({ action: "enroll" }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "MFA_EXISTS");
  assert.ok(!state.calls.some((row) => ["unenroll", "enroll"].includes(row[0])));
});

test("setup replaces only abandoned unverified TOTP factors and keeps secret responses uncached", async () => {
  const { state, access } = await fixture();
  state.claims.aal = "aal1";
  state.factors = {
    all: [
      { id: otherFactor, factor_type: "totp", status: "unverified" },
      { id: "other-kind", factor_type: "phone", status: "unverified" },
    ],
    totp: [],
  };
  const response = await access.POST(post({ action: "enroll" }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).factorId, factorId);
  assert.deepEqual(
    state.calls.filter((row) => row[0] === "unenroll"),
    [["unenroll", { factorId: otherFactor }]],
  );
  assert.equal(state.calls.filter((row) => row[0] === "enroll").length, 1);
});

test("factor verification checks ownership and surfaces provider rejection before declaring success", async () => {
  const { state, access } = await fixture();
  state.claims.aal = "aal1";
  state.factors = {
    all: [{ id: factorId, factor_type: "totp", status: "verified" }],
    totp: [{ id: factorId, status: "verified" }],
  };
  assert.equal(
    (await access.POST(post({ action: "verify", factorId: otherFactor, code: "123456" }))).status,
    400,
  );
  assert.ok(!state.calls.some((row) => row[0] === "challengeAndVerify"));
  state.verifyError = new Error("Code rejected");
  const failed = await access.POST(post({ action: "verify", factorId, code: "123456" }));
  assert.equal(failed.status, 400);
  assert.equal((await failed.json()).error.code, "INVALID_CODE");
  state.verifyError = null;
  const success = await access.POST(post({ action: "verify", factorId, code: "123456" }));
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { verified: true });
});

test("access read exposes only verified factor identifiers and enforces an active operator role", async () => {
  const { state, access } = await fixture();
  state.factors = {
    all: [],
    totp: [
      {
        id: factorId,
        status: "verified",
        friendly_name: "Work authenticator",
        secret: "not-public",
      },
      { id: otherFactor, status: "unverified", secret: "also-private" },
    ],
  };
  const response = await access.GET(new Request(`${origin}/api/operator/access`));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).factors, [{ id: factorId, name: "Work authenticator" }]);
  state.active = false;
  state.calls = [];
  assert.equal((await access.GET(new Request(`${origin}/api/operator/access`))).status, 403);
  assert.ok(!state.calls.some((row) => row[0] === "listFactors"));
});

test("financial POST requires recent admin MFA and preserves the caller operation ID at the service boundary", async () => {
  const { state, operator, runtime } = await fixture();
  const mutations = [];
  const finance = await source("../app/api/operator/finance/route.ts", {
    "@jesus-in-practice/backend/financial-operations": {
      FinancialOperations: class {
        async requestRefund(input) {
          mutations.push(input);
          return {
            id: input.operationId,
            status: "requested",
            holdState: "held",
            amountCents: input.amountCents,
          };
        }
      },
    },
    "@jesus-in-practice/backend/validation": { z },
    "@/lib/server/http": http,
    "@/lib/server/operator": operator,
    "@/lib/server/providers": { stripe: () => ({}) },
    "@/lib/server/runtime": { ...runtime, repository: () => ({}) },
    "@/lib/server/config": config,
  });
  const input = {
    action: "refund",
    operationId: crypto.randomUUID(),
    checkoutId: crypto.randomUUID(),
    amountCents: 200,
    reason: "Customer requested unused credit back.",
    confirmed: true,
  };
  state.role = "support";
  assert.equal((await finance.POST(post(input))).status, 403);
  state.role = "admin";
  state.claims.amr = [];
  assert.equal((await finance.POST(post(input))).status, 403);
  assert.equal(mutations.length, 0);
  state.claims.amr = [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }];
  const response = await finance.POST(post(input));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).refund.id, input.operationId);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].operationId, input.operationId);
  assert.equal(mutations[0].actorId, userId);
});

test("delivery waiver route binds server policy and actor, requires fresh MFA, and accepts no arbitrary amount", async () => {
  const { state, operator, runtime } = await fixture();
  const calls = [];
  const savedPolicy = process.env.COMMERCE_POLICY_APPROVED;
  const route = await source("../app/api/operator/deliveries/route.ts", {
    "@jesus-in-practice/backend/delivery-support": {
      DeliverySupport: class {
        constructor(repository, options) {
          calls.push(["policy", options.commercePolicyApproved]);
        }
        async waiveUnknownDelivery(input) {
          calls.push(["waive", input]);
          return { operationId: input.operationId, deliveryId: input.deliveryId, amountCents: 10 };
        }
      },
    },
    "@jesus-in-practice/backend/validation": { z },
    "@/lib/server/http": http,
    "@/lib/server/operator": operator,
    "@/lib/server/runtime": { ...runtime, repository: () => ({}) },
  });
  const input = {
    operationId: crypto.randomUUID(),
    deliveryId: crypto.randomUUID(),
    reason: "The service bears the provider cost for this uncertain message.",
    confirmed: true,
  };
  try {
    process.env.COMMERCE_POLICY_APPROVED = "true";
    assert.equal((await route.POST(post({ ...input, amountCents: 999 }))).status, 400);
    assert.equal((await route.POST(post({ ...input, confirmed: false }))).status, 400);
    state.claims.amr = [];
    assert.equal((await route.POST(post(input))).status, 403);
    assert.equal(calls.length, 0);
    state.claims.amr = [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }];
    const response = await route.POST(post(input));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).waiver.operationId, input.operationId);
    assert.equal(calls[0][1], true);
    assert.equal(calls[1][1].actorId, userId);
    assert.equal(calls[1][1].deliveryId, input.deliveryId);
    process.env.COMMERCE_POLICY_APPROVED = "false";
    await route.POST(post(input));
    assert.equal(calls[2][1], false, "policy comes from the server setting, never request input");
  } finally {
    if (savedPolicy === undefined) delete process.env.COMMERCE_POLICY_APPROVED;
    else process.env.COMMERCE_POLICY_APPROVED = savedPolicy;
  }
});
