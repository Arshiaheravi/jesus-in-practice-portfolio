/** Opt-in real HTTP/SSR + PostgreSQL check; synthetic identity/content, never hosted providers.
 * pnpm exec node --experimental-strip-types scripts/http-postgres-check.mjs
 *   --run --connection-file .local/test-postgres/connection.json
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createDatabase } from "../packages/backend/src/database.ts";
import { consentVersion, defaultSchedule } from "../packages/backend/src/contracts.ts";
import { ContentRepository } from "../packages/backend/src/content-repository.ts";
import {
  approval,
  approvedRights,
  corpusFixture,
  draftFixture,
  manualProvenance,
  passageFixture,
} from "../packages/backend/tests/content-fixtures.mjs";
import { loadPg } from "./ops-common.mjs";
import { readFixtureConnection } from "./test-postgres-fixture.mjs";

const { values } = parseArgs({
  options: { run: { type: "boolean" }, "connection-file": { type: "string" } },
});
if (!values.run || !values["connection-file"])
  throw new Error("Explicit --run and the ignored portable-fixture connection file are required.");
const workspace = fileURLToPath(new URL("..", import.meta.url));
const connectionFile = resolve(values["connection-file"]);
if (!connectionFile.startsWith(resolve(workspace, ".local") + sep))
  throw new Error("Use a connection file beneath the ignored workspace .local directory.");
const fixture = await readFixtureConnection(connectionFile);
const appOrigin = "http://127.0.0.1:3003";
const authOrigin = "http://127.0.0.1:54330";
const runId = `${Date.now()}_${randomBytes(3).toString("hex")}`;
const databaseName = `jip_http_${runId}`;
const outputDirectory = resolve(workspace, ".local/http-postgres-checks", runId);
const evidence = {
  synthetic: true,
  realHttpAndPostgres: true,
  authProviderMocked: true,
  externalServicesVerified: false,
  database: databaseName,
  appPort: 3003,
  identityPort: 54330,
  checks: [],
  passed: false,
};
const dbUrl = new URL(`postgresql://127.0.0.1:55439/${databaseName}`);
dbUrl.username = fixture.user;
dbUrl.password = fixture.password;
const delay = (ms) => new Promise((accept) => setTimeout(accept, ms));
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const identities = new Map();
function identity(label, aal, secondsSinceMfa = 0) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email: `${label}@example.test`,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    factors: [],
  };
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, aal, amr: aal === "aal2" ? [{ method: "totp", timestamp: now - secondsSinceMfa }] : [] })}.synthetic-http-fixture-signature`;
  identities.set(token, user);
  const session = {
    access_token: token,
    refresh_token: "synthetic-never-valid-outside-loopback",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    user,
  };
  return { user, cookie: `sb-127-auth-token=base64-${encode(session)}` };
}
const member = identity("http-member", "aal1");
const secondMember = identity("http-second-member", "aal1");
const editorAal1 = identity("http-editor-aal1", "aal1");
const editorAal2 = identity("http-editor-aal2", "aal2");
const staleAdmin = identity("http-admin-stale", "aal2", 1800);
const authServer = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  const user = identities.get(request.headers.authorization?.replace(/^Bearer /, ""));
  if (
    request.method === "GET" &&
    request.url === "/auth/v1/user" &&
    request.headers.apikey === "sb_publishable_http_postgres_fixture" &&
    user
  ) {
    response.end(JSON.stringify(user));
    return;
  }
  response.statusCode = 401;
  response.end(JSON.stringify({ code: "fixture_denied", message: "Synthetic identity required." }));
});
async function freePort(port) {
  const server = createTcpServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", accept);
  });
  await new Promise((accept) => server.close(accept));
}
async function runChild(script, args, env) {
  const child = spawn(process.execPath, ["--experimental-strip-types", script, ...args], {
    cwd: workspace,
    env,
    stdio: "ignore",
    windowsHide: true,
    shell: false,
  });
  const code = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", accept);
  });
  assert.equal(code, 0, "Isolated migration process must succeed.");
}
async function request(path, actor, body, options = {}) {
  const response = await fetch(`${appOrigin}${path}`, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      ...(actor ? { Cookie: actor.cookie } : {}),
      ...(body === undefined ? {} : { Origin: appOrigin, "Content-Type": "application/json" }),
      ...options.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  assert.ok(text.length < 2_000_000, "Local fixture response must remain small.");
  return { response, text, json: () => JSON.parse(text) };
}
async function changeMember(actor, command) {
  const previous = await request("/api/member", actor);
  assert.equal(previous.response.status, 200);
  const result = await request("/api/member", actor, {
    revision: previous.json().revision,
    command,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.json().revision, previous.json().revision + 1);
  return result.json();
}
async function check(name, operation) {
  stage = name;
  await operation();
  evidence.checks.push({ name, passed: true });
  console.log(JSON.stringify({ check: name, passed: true, synthetic: true }));
}
async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    await new Promise((accept) => {
      killer.once("exit", accept);
      killer.once("error", accept);
    });
  } else child.kill("SIGTERM");
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((accept) => child.once("exit", accept)),
    delay(5000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

// Explicit blanks override app .env files and ambient provider settings.
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_BUILD_DIR: ".next-live",
  NEXT_PUBLIC_APP_MODE: "live",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_DASHBOARD_URL: appOrigin,
  APP_ORIGIN: appOrigin,
  SUPABASE_URL: authOrigin,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_http_postgres_fixture",
  SUPPORT_EMAIL: "support@example.test",
  OPERATOR_NAME: "Synthetic HTTP fixture operator",
  OPERATOR_MAILING_ADDRESS: "Synthetic fixture address, not for delivery",
  SMS_SEGMENT_PRICE_CAD_CENTS: "5",
  DATABASE_URL: dbUrl.href,
  DATABASE_CA_CERT: "",
  PGOPTIONS: fixture.options,
  CONTENT_RIGHTS_ENABLED: "true",
  RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
  DESTINATION_HASH_SECRET: randomBytes(32).toString("hex"),
  UNSUBSCRIBE_SIGNING_SECRET: randomBytes(32).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  MONITORING_SECRET: randomBytes(32).toString("hex"),
};
for (const name of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_MESSAGING_SERVICE_SID",
  "OPENAI_API_KEY",
  "OPENAI_CONTENT_MODEL",
  "EMAIL_FROM",
  "RETENTION_POLICY_JSON",
  "TRUSTED_CLIENT_IP_HEADER",
])
  env[name] = "";
for (const name of [
  "ENABLE_PAYMENTS",
  "ENABLE_EMAIL_DELIVERY",
  "ENABLE_SMS_DELIVERY",
  "ENABLE_PHONE_VERIFICATION",
  "ENABLE_AI_DRAFTING",
  "ENABLE_RETENTION",
  "COMMERCE_POLICY_APPROVED",
  "STRIPE_LIVE_MODE",
])
  env[name] = "false";
let next;
let database;
let owner;
let databaseCreated = false;
let stage = "initialization";
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await stopChild(next);
    authServer.closeAllConnections();
    process.exit(130);
  });
try {
  await Promise.all([freePort(3003), freePort(54330)]);
  await readFile(resolve(workspace, "apps/dashboard/.next-live/BUILD_ID"), "utf8");
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  stage = "fresh-database";
  const admin = new (loadPg().Client)(fixture);
  try {
    await admin.connect();
    for (const role of ["authenticated", "anon", "service_role"])
      assert.equal(
        (await admin.query("select 1 from pg_roles where rolname=$1", [role])).rowCount,
        1,
        "Portable fixture roles must already exist.",
      );
    await admin.query(`create database "${databaseName}"`);
    databaseCreated = true;
  } finally {
    await admin.end();
  }
  owner = new (loadPg().Client)({ ...fixture, database: databaseName });
  await owner.connect();
  await owner.query(`create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;`);
  stage = "migrations";
  await runChild("packages/backend/scripts/migrate.mjs", ["--apply"], env);
  for (const actor of [member, secondMember, editorAal1, editorAal2, staleAdmin])
    await owner.query("insert into auth.users(id,email) values($1,$2)", [
      actor.user.id,
      actor.user.email,
    ]);
  for (const [actor, role] of [
    [editorAal1, "editor"],
    [editorAal2, "editor"],
    [staleAdmin, "admin"],
  ])
    await owner.query("insert into app.operator_roles(user_id,role) values($1,$2)", [
      actor.user.id,
      role,
    ]);
  database = createDatabase(dbUrl.href);
  const content = new ContentRepository(database, { rightsEnabled: true });
  stage = "synthetic-import";
  const corpus = corpusFixture();
  await content.registerEdition(corpus.manifest, editorAal2.user.id);
  await content.setEditionRights(corpus.manifest.id, approvedRights, editorAal2.user.id);
  await content.importCorpus(corpus.manifest.id, corpus.bytes, editorAal2.user.id);
  const version = await content.createDraft(
    {
      practiceId: "synthetic-http-lesson",
      passage: passageFixture,
      draft: { ...draftFixture, title: "Synthetic HTTP published lesson" },
      provenance: manualProvenance,
    },
    editorAal2.user.id,
  );
  await content.reviewDraft(version.id, approval, editorAal2.user.id);
  await content.publish(version.id, editorAal2.user.id);
  stage = "local-http-start";
  await new Promise((accept, reject) => {
    authServer.once("error", reject);
    authServer.listen(54330, "127.0.0.1", accept);
  });
  const require = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
  next = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3003"],
    {
      cwd: resolve(workspace, "apps/dashboard"),
      env,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    },
  );
  let startError;
  next.once("error", (error) => {
    startError = error;
  });
  const deadline = Date.now() + 45000;
  while (true) {
    if (startError || next.exitCode !== null || Date.now() > deadline)
      throw new Error("Isolated live-build server did not start.");
    try {
      if ((await request("/api/health")).response.status === 200) break;
    } catch {
      /* startup */
    }
    await delay(250);
  }
  stage = "http-assertions";
  await check("anonymous-api-and-page-denied", async () => {
    for (const path of [
      "/api/practices",
      "/api/member",
      "/api/history",
      "/api/wallet",
      "/api/deliveries",
      "/api/account/export",
    ])
      assert.equal((await request(path)).response.status, 401);
    const result = await request("/practice/synthetic-http-lesson");
    assert.equal(result.response.status, 307);
    assert.equal(new URL(result.response.headers.get("location"), appOrigin).pathname, "/signin");
  });
  const practiceId = "notice-your-neighbour";
  const reflection = "Synthetic member reflection: offer a neighbour practical help.";
  const otherReflection = "A separate synthetic member reflection stays in its own account.";
  await check("member-bootstrap-creates-isolated-defaults-with-disabled-providers", async () => {
    for (const actor of [member, secondMember]) {
      const result = await request("/api/member", actor);
      assert.equal(result.response.status, 200);
      assert.match(result.response.headers.get("cache-control"), /private.*no-store/);
      assert.match(result.response.headers.get("x-request-id"), /^[a-f0-9-]{36}$/);
      const data = result.json();
      assert.equal(data.revision, 1);
      assert.equal(data.account.email, actor.user.email);
      assert.equal(data.account.emailConsent, false);
      assert.equal(data.account.smsConsent, false);
      assert.equal(data.state.onboarded, false);
      assert.deepEqual(data.state.notes, {});
      assert.deepEqual(data.state.saved, []);
      assert.deepEqual(data.capabilities, {
        emailDelivery: false,
        smsDelivery: false,
        phoneVerification: false,
      });
      assert.equal(data.wallet.enabled, false);
      assert.equal(data.wallet.availableCents, 0);
      assert.equal(data.operator.supportEmail, env.SUPPORT_EMAIL);
    }
    const stored = await owner.query("select count(*)::integer as count from app.profiles");
    assert.equal(stored.rows[0].count, 2);
  });
  await check("member-onboarding-saves-and-reflections-persist-through-real-routes", async () => {
    const onboarded = await changeMember(member, {
      type: "onboarding",
      source: "both",
      topics: ["Service"],
      channel: "email",
      timezone: "America/Toronto",
      schedule: defaultSchedule,
    });
    assert.equal(onboarded.state.onboarded, true);
    assert.equal(onboarded.state.source, "both");
    assert.deepEqual(onboarded.state.topics, ["Service"]);
    await changeMember(member, { type: "saved", practiceId, saved: true });
    await changeMember(member, { type: "reflection", practiceId, text: reflection });
    const read = (await request("/api/member", member)).json();
    assert.deepEqual(read.state.saved, [practiceId]);
    assert.equal(read.state.notes[practiceId], reflection);
    const stored = await owner.query(
      "select body from app.notes where user_id=$1 and practice_id=$2",
      [member.user.id, practiceId],
    );
    assert.equal(stored.rows[0].body, reflection);
  });
  await check(
    "schedule-channel-and-timezone-update-atomically-without-granting-consent",
    async () => {
      const schedule = { ...defaultSchedule, times: ["09:30"], days: [1, 3, 5] };
      const result = await changeMember(member, {
        type: "schedule",
        schedule,
        channel: "both",
        timezone: "America/Vancouver",
      });
      assert.deepEqual(result.state.schedule, schedule);
      assert.equal(result.state.channel, "both");
      assert.equal(result.state.timezone, "America/Vancouver");
      assert.equal(result.account.emailConsent, false);
      assert.equal(result.account.smsConsent, false);
      assert.equal(result.state.notes[practiceId], reflection);
    },
  );
  await check("stale-member-revision-preserves-the-committed-reflection", async () => {
    const before = (await request("/api/member", member)).json();
    const result = await request("/api/member", member, {
      revision: before.revision - 1,
      command: {
        type: "reflection",
        practiceId,
        text: "Synthetic stale draft must not overwrite.",
      },
    });
    assert.equal(result.response.status, 409);
    assert.equal(result.json().error.code, "CONFLICT");
    const after = (await request("/api/member", member)).json();
    assert.equal(after.revision, before.revision);
    assert.equal(after.state.notes[practiceId], reflection);
  });
  await check("member-write-validation-and-origin-errors-make-no-data-change", async () => {
    const before = (await request("/api/member", member)).json();
    const command = { type: "reflection", practiceId, text: "Uncommitted synthetic draft." };
    const wrongOrigin = await request(
      "/api/member",
      member,
      { revision: before.revision, command },
      { headers: { Origin: "https://unrelated.example.test" } },
    );
    assert.equal(wrongOrigin.response.status, 403);
    assert.equal(wrongOrigin.json().error.code, "FORBIDDEN");
    for (const body of [
      { revision: before.revision, command, userId: secondMember.user.id },
      { revision: before.revision, command: { ...command, text: "x".repeat(1501) } },
    ]) {
      const invalid = await request("/api/member", member, body);
      assert.equal(invalid.response.status, 400);
      assert.equal(invalid.json().error.code, "VALIDATION");
    }
    const after = (await request("/api/member", member)).json();
    assert.equal(after.revision, before.revision);
    assert.equal(after.state.notes[practiceId], reflection);
  });
  await check("two-member-reflections-and-saved-practices-remain-isolated", async () => {
    const second = await changeMember(secondMember, {
      type: "reflection",
      practiceId,
      text: otherReflection,
    });
    assert.equal(second.state.notes[practiceId], otherReflection);
    assert.deepEqual(second.state.saved, []);
    assert.equal(second.history.total, 0);
    const first = (await request("/api/member", member)).json();
    assert.equal(first.state.notes[practiceId], reflection);
    assert.deepEqual(first.state.saved, [practiceId]);
    assert.notEqual(first.wallet.supportId, second.wallet.supportId);
    const ownSaved = await request("/api/practices?saved=true", secondMember);
    assert.equal(ownSaved.response.status, 200);
    assert.equal(ownSaved.json().total, 0);
  });
  await check("completion-commands-set-and-clear-the-exact-record-without-duplicates", async () => {
    const command = { type: "completion", practiceId, date: "2026-01-15", completed: true };
    await changeMember(member, command);
    const repeated = await changeMember(member, command);
    assert.equal(repeated.history.total, 1);
    assert.deepEqual(repeated.state.completed, [{ id: practiceId, date: command.date }]);
    const removed = await changeMember(member, { ...command, completed: false });
    assert.equal(removed.history.total, 0);
    await changeMember(member, command);
  });
  await check(
    "history-pagination-returns-every-seeded-record-without-cross-user-data",
    async () => {
      // Only the long-history fixture is seeded directly; member edits above use actual HTTP APIs.
      await owner.query(
        "insert into app.completions(user_id,practice_id,local_date) select $1,$2,date '2025-01-01'+day from generate_series(0,102) day",
        [member.user.id, practiceId],
      );
      const first = await request("/api/history", member);
      assert.equal(first.response.status, 200);
      assert.equal(first.json().total, 104);
      assert.equal(first.json().items.length, 100);
      assert.equal(typeof first.json().nextCursor, "string");
      const last = await request(
        `/api/history?cursor=${encodeURIComponent(first.json().nextCursor)}`,
        member,
      );
      assert.equal(last.response.status, 200);
      assert.equal(last.json().total, 104);
      assert.equal(last.json().items.length, 4);
      assert.equal(last.json().nextCursor, null);
      const all = [...first.json().items, ...last.json().items];
      assert.equal(new Set(all.map((item) => item.recordId)).size, 104);
      const second = await request(
        `/api/history?cursor=${encodeURIComponent(first.json().nextCursor)}`,
        secondMember,
      );
      assert.equal(second.response.status, 200);
      assert.deepEqual(second.json(), { items: [], nextCursor: null, total: 0 });
      const bootstrap = (await request("/api/member", member)).json();
      assert.equal(bootstrap.history.total, 104);
      assert.equal(bootstrap.history.hasMore, true);
      assert.equal(bootstrap.state.completed.length, 100);
    },
  );
  await check(
    "account-export-includes-full-history-and-only-the-authenticated-member",
    async () => {
      const exported = await request("/api/account/export", member);
      assert.equal(exported.response.status, 200);
      assert.match(exported.response.headers.get("content-disposition"), /attachment/);
      assert.match(exported.response.headers.get("cache-control"), /private.*no-store/);
      const data = exported.json();
      assert.equal(data.email, member.user.email);
      assert.equal(data.completions.length, 104);
      assert.equal(data.notes[0].body, reflection);
      assert.equal(exported.text.includes(otherReflection), false);
      assert.equal(exported.text.includes(secondMember.user.email), false);
      const other = await request("/api/account/export", secondMember);
      assert.equal(other.response.status, 200);
      assert.equal(other.json().completions.length, 0);
      assert.equal(other.json().notes[0].body, otherReflection);
      assert.equal(other.text.includes(reflection), false);
    },
  );
  await check(
    "email-consent-requires-current-wording-and-can-be-withdrawn-with-delivery-disabled",
    async () => {
      const stale = await request("/api/consent", member, {
        channel: "email",
        enabled: true,
        consentVersion: "synthetic-outdated-version",
      });
      assert.equal(stale.response.status, 409);
      assert.equal(stale.json().error.code, "CONSENT_CHANGED");
      const grant = await request("/api/consent", member, {
        channel: "email",
        enabled: true,
        consentVersion: consentVersion("email", null),
      });
      assert.equal(grant.response.status, 200);
      const granted = (await request("/api/member", member)).json();
      assert.equal(granted.account.emailConsent, true);
      assert.equal(granted.account.smsConsent, false);
      assert.equal(granted.capabilities.emailDelivery, false);
      const withdrawal = await request("/api/consent", member, {
        channel: "email",
        enabled: false,
      });
      assert.equal(withdrawal.response.status, 200);
      assert.equal((await request("/api/member", member)).json().account.emailConsent, false);
      const events = await owner.query(
        "select granted from app.consent_events where user_id=$1 order by sequence",
        [member.user.id],
      );
      assert.deepEqual(
        events.rows.map((event) => event.granted),
        [true, false],
      );
    },
  );
  await check("disabled-provider-actions-preserve-wallet-phone-and-account-state", async () => {
    for (const [path, body, method] of [
      ["/api/wallet/checkout", { amountCents: 1000, operationId: randomUUID() }, "POST"],
      ["/api/phone/start", { phone: "+14165550123" }, "POST"],
      ["/api/phone/verify", { code: "123456" }, "POST"],
      ["/api/account", { confirmation: "DELETE" }, "DELETE"],
    ]) {
      const result = await request(path, member, body, { method });
      assert.equal(result.response.status, 503);
      assert.equal(result.json().error.code, "UNAVAILABLE");
    }
    const wallet = await request("/api/wallet", member);
    assert.equal(wallet.response.status, 200);
    assert.equal(wallet.json().enabled, false);
    assert.equal(wallet.json().availableCents, 0);
    assert.equal(wallet.json().reservedCents, 0);
    assert.deepEqual(wallet.json().entries, []);
    const deliveries = await request("/api/deliveries", member);
    assert.equal(deliveries.response.status, 200);
    assert.deepEqual(deliveries.json(), { items: [], total: 0, nextCursor: null });
    const stored = await owner.query(
      "select (select count(*)::integer from app.checkout_intents) as checkouts,(select count(*)::integer from app.phone_challenges) as challenges,(select deleting from app.profiles where user_id=$1) as deleting",
      [member.user.id],
    );
    assert.deepEqual(stored.rows[0], { checkouts: 0, challenges: 0, deleting: false });
  });
  await check("published-catalogue-filters-and-provenance", async () => {
    const selected = await request(
      "/api/practices?source=book-of-mormon&q=synthetic%20http",
      member,
    );
    assert.equal(selected.response.status, 200);
    assert.equal(selected.json().total, 1);
    assert.equal(selected.json().items[0].versionId, version.id);
    assert.match(selected.response.headers.get("cache-control"), /no-store/);
    const bible = await request("/api/practices?source=bible&q=synthetic%20http", member);
    assert.equal(bible.response.status, 200);
    assert.equal(bible.json().total, 0);
  });
  await check("published-api-and-ssr-resolve-real-database", async () => {
    const api = await request("/api/practices/synthetic-http-lesson", member);
    assert.equal(api.response.status, 200);
    assert.equal(api.json().practice.reference, "mosiah 2:2");
    assert.equal(api.json().practice.editionTitle, corpus.manifest.title);
    const html = await request("/practice/synthetic-http-lesson", member);
    assert.equal(html.response.status, 200);
    assert.match(html.text, /<title>Synthetic HTTP published lesson/);
    assert.match(html.text, /mosiah 2:2/);
    assert.match(html.text, /Ask if help carrying one bag would be useful/);
    assert.match(html.response.headers.get("x-robots-tag"), /noindex/);
  });
  await check("unknown-api-and-ssr-return-404", async () => {
    assert.equal((await request("/api/practices/synthetic-missing", member)).response.status, 404);
    assert.equal((await request("/practice/synthetic-missing", member)).response.status, 404);
  });
  await check("nonoperator-and-aal1-denied-editorial-api", async () => {
    const nonoperator = await request("/api/operator/content", member);
    assert.equal(nonoperator.response.status, 403);
    assert.equal(nonoperator.json().error.code, "OPERATOR_REQUIRED");
    const aal1 = await request("/api/operator/content", editorAal1);
    assert.equal(aal1.response.status, 403);
    assert.equal(aal1.json().error.code, "MFA_REQUIRED");
  });
  await check("aal2-editor-can-read-but-not-administer-finances", async () => {
    const allowed = await request("/api/operator/content", editorAal2);
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.json().drafts.items[0].id, version.id);
    const denied = await request("/api/operator/cases", editorAal2);
    assert.equal(denied.response.status, 403);
    assert.equal(denied.json().error.code, "OPERATOR_REQUIRED");
  });
  await check("admin-stale-mfa-denied-before-financial-provider", async () => {
    const denied = await request("/api/operator/finance", staleAdmin, {
      action: "refund",
      operationId: randomUUID(),
      checkoutId: randomUUID(),
      amountCents: 100,
      reason: "Synthetic HTTP stale MFA rejection test.",
      confirmed: true,
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.json().error.code, "MFA_REQUIRED");
  });
  await check("withdrawal-removes-api-and-ssr-availability", async () => {
    const withdrawn = await request("/api/operator/content", editorAal2, {
      action: "withdraw",
      versionId: version.id,
      reason: "Synthetic HTTP withdrawal verification.",
      confirmed: true,
    });
    assert.equal(withdrawn.response.status, 200);
    assert.equal(
      (await request("/api/practices/synthetic-http-lesson", member)).response.status,
      404,
    );
    assert.equal((await request("/practice/synthetic-http-lesson", member)).response.status, 404);
    const list = await request("/api/practices?q=synthetic%20http", member);
    assert.equal(list.response.status, 200);
    assert.equal(list.json().total, 0);
  });
  await check("edition-rights-revocation-removes-current-publication", async () => {
    const replacement = await content.createDraft(
      {
        practiceId: "synthetic-http-lesson",
        passage: passageFixture,
        draft: { ...draftFixture, title: "Synthetic HTTP replacement lesson" },
        provenance: manualProvenance,
      },
      editorAal2.user.id,
    );
    await content.reviewDraft(replacement.id, approval, editorAal2.user.id);
    await content.publish(replacement.id, editorAal2.user.id);
    assert.equal(
      (await request("/api/practices/synthetic-http-lesson", member)).response.status,
      200,
    );
    await content.setEditionRights(
      corpus.manifest.id,
      {
        ...approvedRights,
        approved: false,
        evidence: "Synthetic permission revoked for HTTP verification.",
      },
      editorAal2.user.id,
    );
    assert.equal(
      (await request("/api/practices/synthetic-http-lesson", member)).response.status,
      404,
    );
    assert.equal((await request("/practice/synthetic-http-lesson", member)).response.status, 404);
  });
  await check("operator-revocation-takes-effect-with-existing-session", async () => {
    await owner.query("update app.operator_roles set active=false where user_id=$1", [
      editorAal2.user.id,
    ]);
    const denied = await request("/api/operator/content", editorAal2);
    assert.equal(denied.response.status, 403);
    assert.equal(denied.json().error.code, "OPERATOR_REQUIRED");
  });
  evidence.passed = true;
} catch (error) {
  evidence.failure = { stage, category: error?.code || error?.name || "CHECK_FAILED" };
  console.error(JSON.stringify({ passed: false, synthetic: true, ...evidence.failure }));
  process.exitCode = 1;
} finally {
  await stopChild(next);
  authServer.closeAllConnections();
  if (authServer.listening) await new Promise((accept) => authServer.close(accept));
  await database?.close();
  await owner?.end();
  if (databaseCreated) {
    const cleanup = new (loadPg().Client)(fixture);
    try {
      await cleanup.connect();
      // This identifier is generated above and marked owned only after CREATE succeeds.
      // Never drop the caller's bootstrap database or force other sessions to disconnect.
      await cleanup.query(`drop database "${databaseName}"`);
      assert.equal(
        (await cleanup.query("select 1 from pg_database where datname=$1", [databaseName]))
          .rowCount,
        0,
      );
      evidence.cleanup = { databaseRemoved: true };
    } catch (error) {
      evidence.cleanup = {
        databaseRemoved: false,
        category: error?.code || error?.name || "CLEANUP_FAILED",
      };
      evidence.passed = false;
      process.exitCode = 1;
    } finally {
      await cleanup.end();
    }
  }
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(outputDirectory, "evidence.json"), JSON.stringify(evidence, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      evidence: `.local/http-postgres-checks/${runId}/evidence.json`,
      passed: evidence.passed,
      checks: evidence.checks.length,
    }),
  );
}
