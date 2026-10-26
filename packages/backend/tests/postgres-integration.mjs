/** Opt-in, destructive-fixture setup in an EMPTY explicitly named isolated database only.
 * Real PostgreSQL sessions; synthetic Auth schema and payment provider, never real services.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { before, after, test } from "node:test";
import pg from "pg";
import { Database } from "../src/database.ts";
import { databaseConnectionConfig } from "../src/database-config.ts";
import { BackendRepository } from "../src/repository.ts";
import { FinancialOperations } from "../src/financial-operations.ts";
import { DeliverySupport } from "../src/delivery-support.ts";
import { DeliveryStore } from "../src/operational.ts";
import { inspectReadiness } from "../src/maintenance.ts";

if (process.env.RUN_POSTGRES_INTEGRATION !== "true")
  throw new Error("Set RUN_POSTGRES_INTEGRATION=true and a dedicated TEST_DATABASE_URL.");
const url = new URL(process.env.TEST_DATABASE_URL || "");
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/jip_integration_[a-z0-9_]+$/.test(url.pathname)
)
  throw new Error("Only a loopback database named jip_integration_<unique fixture> is accepted.");
const connection = databaseConnectionConfig(url.href);
const owner = new pg.Client(connection);
const pools = [new pg.Pool({ ...connection, max: 1 }), new pg.Pool({ ...connection, max: 1 })];
const databases = pools.map((pool) => new Database(pool));
const repos = databases.map((database) => new BackendRepository(database));
const expectedMigrations = [];
let administrator;
const reason = "Synthetic integration fixture requests unused credit refund.";
const timeout = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

before(async () => {
  await owner.connect();
  const occupied = await owner.query(
    "select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in ('r','p','v','m','S')",
  );
  assert.equal(
    occupied.rows[0].count,
    0,
    "Fixture database must be empty; existing data is never cleared.",
  );
  for (const role of ["authenticated", "anon", "service_role"]) {
    if (!(await owner.query("select 1 from pg_roles where rolname=$1", [role])).rows.length)
      await owner.query(
        `create role ${role} nologin${role === "service_role" ? " bypassrls" : ""}`,
      );
  }
  await owner.query(`create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
    create schema app; create table app.schema_migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());`);
  const folder = new URL("../../../database/migrations/", import.meta.url);
  for (const name of (await readdir(folder)).filter((name) => name.endsWith(".sql")).sort()) {
    const content = await readFile(new URL(name, folder), "utf8");
    const sha256 = createHash("sha256").update(content).digest("hex");
    await owner.query("begin");
    try {
      await owner.query(content.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, ""));
      await owner.query("insert into app.schema_migrations(name,sha256) values($1,$2)", [
        name,
        sha256,
      ]);
      await owner.query("commit");
    } catch (error) {
      await owner.query("rollback");
      throw error;
    }
    expectedMigrations.push({ name, sha256 });
  }
  administrator = await member();
  await owner.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [
    administrator,
  ]);
});
after(async () => {
  await Promise.allSettled(databases.map((db) => db.close()));
  await owner.end();
});

async function member() {
  const id = randomUUID();
  await owner.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@example.test`]);
  await repos[0].ensureProfile(id);
  return id;
}
async function purchase(amountCents = 500, funded = true) {
  const userId = await member();
  const checkout = await repos[0].createCheckout(userId, amountCents, randomUUID());
  const suffix = randomUUID().replaceAll("-", "");
  const payment = {
    checkoutId: checkout.id,
    providerSessionId: `cs_fixture_${suffix}`,
    paymentIntentId: `pi_fixture_${suffix}`,
    eventId: `evt_fixture_${suffix}`,
    amountCents,
    currency: "cad",
  };
  await repos[0].attachCheckoutSession(checkout.id, payment.providerSessionId);
  if (funded) await repos[0].fundCheckout(payment);
  return { userId, checkout, payment };
}
async function wallet(userId) {
  return (
    await owner.query(
      "select available_cents as available,reserved_cents as reserved,blocked_reason as blocked from app.wallets where user_id=$1",
      [userId],
    )
  ).rows[0];
}
async function delivery(userId) {
  const id = randomUUID(),
    phone = `+1416${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;
  const hash = createHash("sha256").update(phone).digest("hex");
  const contact = await repos[0].upsertContact(userId, "sms", phone, true, hash);
  const consent = await repos[0].setConsent(userId, "sms", true, "synthetic-v1");
  await owner.query(
    `insert into app.deliveries(id,user_id,occurrence_key,channel,practice_id,content_version,profile_version,contact_id,contact_version,consent_id,destination_hash,payload,scheduled_at,expires_at)
    values($1::uuid,$2,$1::uuid::text,'sms','notice-your-neighbour','fixture-v1',1,$3,1,$4,$5,'{}',now(),now()+interval '1 day')`,
    [id, userId, contact.id, consent, hash],
  );
  return id;
}
function provider(payment) {
  const fake = {
    calls: [],
    refunds: [],
    async financialEvidence(paymentIntentId) {
      return {
        paymentIntentId,
        amountCents: payment.amountCents,
        currency: "cad",
        complete: true,
        refunds: [...fake.refunds],
        disputes: [],
      };
    },
    async createRefund(input) {
      fake.calls.push(input);
      await timeout(100);
      const refund = {
        id: `re_fixture_${randomUUID().replaceAll("-", "")}`,
        paymentIntentId: input.paymentIntentId,
        operationId: input.operationId,
        amountCents: input.amountCents,
        currency: "cad",
        status: "succeeded",
      };
      fake.refunds.push(refund);
      return { outcome: "accepted", refund };
    },
    async retrieveRefund(id) {
      return fake.refunds.find((refund) => refund.id === id);
    },
    async listFundingSessions() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async retrieveFunding() {
      return {
        status: "paid",
        sessionId: payment.providerSessionId,
        paymentIntentId: payment.paymentIntentId,
        amountCents: payment.amountCents,
        currency: "cad",
      };
    },
  };
  return fake;
}
const refundRequest = (checkout, amountCents = 300) => ({
  operationId: randomUUID(),
  checkoutId: checkout.id,
  amountCents,
  actorId: administrator,
  reason,
});
async function compete(userId, operations) {
  // Prove both independent transactions are waiting on the same wallet before releasing it.
  await owner.query("begin");
  await owner.query("select id from app.wallets where user_id=$1 for update", [userId]);
  const pending = Promise.allSettled(operations.map((operation) => operation()));
  let waiting = 0;
  try {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      waiting = (
        await owner.query(
          "select count(*)::int as count from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock'",
        )
      ).rows[0].count;
      if (waiting >= operations.length) break;
      await timeout(20);
    }
  } finally {
    await owner.query("rollback");
  }
  const result = await pending;
  assert.ok(waiting >= operations.length, "Both real sessions reached a conflicting database lock");
  return result;
}

test("all migrations apply on PostgreSQL and readiness sees RLS and least-privilege grants", async () => {
  assert.equal(expectedMigrations.length, 9);
  const status = await inspectReadiness(databases[0], {
    expectedMigrations,
    configuration: { fixture: true },
    deliveryEnabled: false,
    retentionRequired: false,
  });
  assert.equal(status.ready, true, JSON.stringify(status.checks));
  assert.equal(status.externalServicesVerified, false);
});
test("independent sessions enforce cross-user RLS and roll back role/claims/data without leakage", async () => {
  const pids = await Promise.all(pools.map((pool) => pool.query("select pg_backend_pid() as pid")));
  assert.notEqual(pids[0].rows[0].pid, pids[1].rows[0].pid);
  const first = await member(),
    second = await member();
  await repos[0].mutateMember(first, 1, {
    type: "reflection",
    practiceId: "notice-your-neighbour",
    text: "Synthetic private reflection",
  });
  assert.equal(
    (await databases[1].withUser(second, (sql) => sql.query("select * from app.notes"))).rows
      .length,
    0,
  );
  await assert.rejects(
    databases[1].withUser(second, (sql) =>
      sql.query(
        "insert into app.notes(user_id,practice_id,body) values($1,'notice-your-neighbour','forbidden')",
        [first],
      ),
    ),
    /row-level security/i,
  );
  await assert.rejects(
    databases[0].withUser(first, async (sql) => {
      await sql.query("update app.notes set body='rolled back' where user_id=$1", [first]);
      throw new Error("fixture rollback");
    }),
    /fixture rollback/,
  );
  assert.equal(
    (await owner.query("select body from app.notes where user_id=$1", [first])).rows[0].body,
    "Synthetic private reflection",
  );
  const reset = (
    await pools[0].query(
      "select current_user as role,nullif(current_setting('request.jwt.claims',true),'') as claims",
    )
  ).rows[0];
  assert.notEqual(reset.role, "authenticated");
  assert.equal(reset.claims, null);
  await owner.query("begin;set local role anon");
  try {
    await assert.rejects(owner.query("select * from app.wallets"), /permission denied/i);
  } finally {
    await owner.query("rollback");
  }
});
test("simultaneous duplicate funding creates exactly one immutable wallet credit", async () => {
  const { userId, payment } = await purchase(500, false);
  const results = await compete(
    userId,
    repos.map((repo) => () => repo.fundCheckout(payment)),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled" && result.value.funded).length,
    1,
  );
  assert.ok(results.every((result) => result.status === "fulfilled"));
  assert.deepEqual(await wallet(userId), { available: 500, reserved: 0, blocked: null });
  assert.equal(
    (
      await owner.query(
        "select count(*)::int as count from app.credit_ledger where idempotency_key=$1",
        [`fund:${payment.checkoutId}`],
      )
    ).rows[0].count,
    1,
  );
  await assert.rejects(
    owner.query("delete from app.credit_ledger where idempotency_key=$1", [
      `fund:${payment.checkoutId}`,
    ]),
    /immutable/i,
  );
});
test("simultaneous SMS reservations cannot overspend one wallet", async () => {
  const { userId } = await purchase();
  const ids = [await delivery(userId), await delivery(userId)];
  const results = await compete(
    userId,
    repos.map((repo, index) => () => repo.reserveCredits(userId, ids[index], 400)),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "insufficient_funds",
  );
  assert.deepEqual(await wallet(userId), { available: 100, reserved: 400, blocked: null });
});
test("simultaneous refund requests cannot overspend and preserve their audit hold", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment);
  const results = await compete(
    userId,
    repos.map(
      (repo) => () =>
        new FinancialOperations(repo, fake).requestRefund(refundRequest(checkout, 400)),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "insufficient_funds",
  );
  assert.deepEqual(await wallet(userId), { available: 100, reserved: 400, blocked: null });
});
test("same refund operation requested simultaneously holds credit once", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment),
    input = refundRequest(checkout);
  const results = await compete(
    userId,
    repos.map((repo) => () => new FinancialOperations(repo, fake).requestRefund(input)),
  );
  assert.ok(results.every((result) => result.status === "fulfilled"));
  assert.deepEqual(await wallet(userId), { available: 200, reserved: 300, blocked: null });
  assert.equal(
    (
      await owner.query(
        "select count(*)::int as count from app.credit_ledger where idempotency_key=$1",
        [`refund-hold:${input.operationId}`],
      )
    ).rows[0].count,
    1,
  );
});
test("refund hold and delivery reservation share the same atomic wallet limit", async () => {
  const { userId, checkout, payment } = await purchase();
  const id = await delivery(userId);
  const results = await compete(userId, [
    () =>
      new FinancialOperations(repos[0], provider(payment)).requestRefund(refundRequest(checkout)),
    () => repos[1].reserveCredits(userId, id, 300),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "insufficient_funds",
  );
  assert.deepEqual(await wallet(userId), { available: 200, reserved: 300, blocked: null });
});
test("simultaneous refund processing uses one provider submission and settles once", async () => {
  const { userId, checkout, payment } = await purchase();
  const fake = provider(payment),
    finance = repos.map((repo) => new FinancialOperations(repo, fake));
  const held = await finance[0].requestRefund(refundRequest(checkout));
  await Promise.all(finance.map((instance) => instance.processRefund(held.id)));
  assert.equal(fake.calls.length, 1);
  assert.equal((await finance[0].getRefund(held.id)).status, "succeeded");
  assert.deepEqual(await wallet(userId), { available: 200, reserved: 0, blocked: null });
});
test("funding racing a dispute always leaves credited wallet blocked and evidence deduplicated", async () => {
  const { userId, payment } = await purchase(500, false);
  const incident = {
    paymentIntentId: payment.paymentIntentId,
    eventId: `evt_dispute_${randomUUID()}`,
    kind: "dispute",
    amountCents: 500,
  };
  await Promise.all([
    repos[0].fundCheckout(payment),
    repos[1].restrictWalletByPaymentIntent(incident),
  ]);
  await repos[0].restrictWalletByPaymentIntent(incident);
  assert.deepEqual(await wallet(userId), {
    available: 500,
    reserved: 0,
    blocked: "payment_dispute",
  });
  assert.equal(
    (
      await owner.query(
        "select count(*)::int as count from app.financial_events where provider_event_id=$1",
        [incident.eventId],
      )
    ).rows[0].count,
    1,
  );
});

test("merchant waiver racing late delivery confirmation releases or settles credit exactly once", async () => {
  const { userId } = await purchase(100);
  const id = await delivery(userId);
  await repos[0].reserveCredits(userId, id, 10);
  await owner.query("update app.deliveries set status='unknown' where id=$1", [id]);
  const support = new DeliverySupport(repos[0], { commercePolicyApproved: true });
  const store = new DeliveryStore(repos[1]);
  const operationId = randomUUID();
  const results = await compete(userId, [
    () =>
      support.waiveUnknownDelivery({
        operationId,
        deliveryId: id,
        actorId: administrator,
        reason: "Synthetic merchant-funded waiver accepts any provider cost.",
        confirmed: true,
      }),
    () => store.finish(id, "delivered", "SM_fixture_late"),
  ]);
  assert.equal(results[1].status, "fulfilled");
  const waived = results[0].status === "fulfilled";
  if (!waived) assert.equal(results[0].reason.code, "waiver_unavailable");
  assert.deepEqual(await wallet(userId), {
    available: waived ? 100 : 90,
    reserved: 0,
    blocked: null,
  });
  assert.equal(
    (await owner.query("select status from app.credit_reservations where delivery_id=$1", [id]))
      .rows[0].status,
    waived ? "waived" : "settled",
  );
  await store.finish(id, "delivered", "SM_fixture_late");
  assert.deepEqual(await wallet(userId), {
    available: waived ? 100 : 90,
    reserved: 0,
    blocked: null,
  });
  assert.equal(
    (
      await owner.query(
        "select count(*)::int as count from app.credit_ledger l join app.wallets w on w.id=l.wallet_id where w.user_id=$1",
        [userId],
      )
    ).rows[0].count,
    3,
  );
});
