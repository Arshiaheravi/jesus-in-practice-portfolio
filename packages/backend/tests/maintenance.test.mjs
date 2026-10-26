import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { inspectReadiness, parseRetentionPolicy, runRetention } from "../src/maintenance.ts";
import { createTestDatabase } from "./helpers/database.mjs";
import { FinancialOperations } from "../src/financial-operations.ts";

let fixture;
before(async () => {
  fixture = await createTestDatabase();
});
after(async () => {
  await fixture?.close();
});
const policy = {
  approvalReference: "TEST-ONLY-APPROVAL",
  approvedAt: "2026-01-01T00:00:00Z",
  expiredPhoneChallengeDays: 7,
  rateLimitDays: 7,
  terminalPayloadDays: 30,
  batchSize: 2,
};

test("retention requires explicit approved bounded periods", () => {
  assert.throws(() => parseRetentionPolicy({}));
  assert.throws(() => parseRetentionPolicy({ ...policy, rateLimitDays: 1 }));
  assert.throws(() => parseRetentionPolicy({ ...policy, batchSize: 501 }));
  assert.throws(() => parseRetentionPolicy({ ...policy, approvedAt: "2999-01-01T00:00:00Z" }));
  assert.equal(parseRetentionPolicy(policy).batchSize, 2);
});

test("dry-run is non-mutating and applied retention is bounded while preserving unresolved/financial evidence", async () => {
  const { sql, repo, db } = fixture;
  const member = await fixture.createMember();
  const address = `${member}@example.test`;
  const hash = createHash("sha256").update(address).digest("hex");
  const contact = await repo.upsertContact(member, "email", address, true, hash);
  const consent = await repo.setConsent(member, "email", true, "fixture-v1");
  const ids = [];
  for (const status of ["delivered", "failed", "cancelled", "unknown", "submitted"]) {
    const id = randomUUID();
    ids.push(id);
    await sql.query(
      `insert into app.deliveries(id,user_id,occurrence_key,channel,practice_id,content_version,profile_version,contact_id,contact_version,consent_id,destination_hash,payload,scheduled_at,expires_at,status,updated_at)
      values($1,$2,$3,'email','notice-your-neighbour','v1',1,$4,1,$5,$6,$7::jsonb,'2020-01-01','2020-01-02',$8,'2020-01-01')`,
      [
        id,
        member,
        id,
        contact.id,
        consent,
        hash,
        JSON.stringify({
          to: address,
          body: "Private frozen fixture",
          localDate: "2020-01-01",
          quoteCents: 0,
          segments: 1,
        }),
        status,
      ],
    );
  }
  await sql.query(
    "insert into app.rate_limits(bucket_key,window_started_at,count) values('old-a','2020-01-01',1),('old-b','2020-01-01',1),('old-c','2020-01-01',1),('active',now(),1)",
  );
  await sql.query(
    "insert into app.phone_challenges(user_id,phone,challenge_id,expires_at) values($1,'+14165550100','fixture','2020-01-01')",
    [member],
  );
  await sql.query(
    "insert into app.suppressions(channel,destination_hash,reason) values('email',$1,'fixture-optout')",
    [hash],
  );
  await sql.query(
    "insert into app.webhook_receipts(provider,event_id,payload_hash,status,received_at) values('fixture','old-receipt',$1,'processed','2020-01-01')",
    [hash],
  );
  const dry = await runRetention(db, policy, { dryRun: true });
  assert.deepEqual(dry.counts, {
    expiredPhoneChallenges: 1,
    oldRateLimits: 2,
    terminalPayloads: 2,
  });
  assert.equal(dry.hasMore, true);
  assert.equal((await sql.query("select count(*) from app.maintenance_runs")).rows[0].count, 0);
  assert.equal(
    (
      await sql.query("select payload->>'to' as destination from app.deliveries where id=$1", [
        ids[0],
      ])
    ).rows[0].destination,
    address,
  );
  const applied = await runRetention(db, policy, { dryRun: false });
  assert.deepEqual(applied.counts, dry.counts);
  const again = await runRetention(db, policy, { dryRun: false });
  assert.equal(again.counts.terminalPayloads, 1);
  const rows = (
    await sql.query(
      "select status,payload,payload_redacted_at from app.deliveries where user_id=$1",
      [member],
    )
  ).rows;
  for (const row of rows) {
    if (["unknown", "submitted"].includes(row.status)) {
      assert.equal(row.payload.to, address);
      assert.equal(row.payload_redacted_at, null);
    } else {
      assert.equal(row.payload.to, undefined);
      assert.equal(row.payload.body, undefined);
      assert.equal(row.payload.localDate, "2020-01-01");
    }
  }
  assert.equal(
    (await sql.query("select count(*) from app.suppressions where destination_hash=$1", [hash]))
      .rows[0].count,
    1,
  );
  assert.equal(
    (await sql.query("select count(*) from app.webhook_receipts where event_id='old-receipt'"))
      .rows[0].count,
    1,
  );
  assert.equal(
    (await sql.query("select count(*) from app.rate_limits where bucket_key='active'")).rows[0]
      .count,
    1,
  );
  await assert.rejects(
    db.withUser(member, (connection) => connection.query("select * from app.maintenance_runs")),
  );
});

test("readiness fails closed for missing migrations and redacts inspection failures", async () => {
  const readiness = await inspectReadiness(fixture.db, {
    expectedMigrations: [{ name: "required.sql" }],
    configuration: { operator: false },
    deliveryEnabled: false,
    retentionRequired: false,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.externalServicesVerified, false);
  assert.ok(
    readiness.checks.some((check) => check.code === "migrations" && check.status === "fail"),
  );
  const unavailable = await inspectReadiness(
    {
      withService: async () => {
        throw new Error("credential-private-value");
      },
    },
    { expectedMigrations: [], configuration: {}, deliveryEnabled: false, retentionRequired: false },
  );
  assert.equal(unavailable.ready, false);
  assert.ok(!JSON.stringify(unavailable).includes("credential-private-value"));
});

test("retention preserves payloads during refund holds and never changes financial ledger evidence", async () => {
  const { sql, repo, db } = fixture;
  const user = await fixture.createMember();
  await sql.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [user]);
  const checkout = await repo.createCheckout(user, 500, randomUUID());
  await repo.fundCheckout({
    checkoutId: checkout.id,
    providerSessionId: "cs_retention_fixture",
    paymentIntentId: "pi_retention_fixture",
    amountCents: 500,
    currency: "cad",
    eventId: "evt_retention_fixture",
  });
  const finance = new FinancialOperations(repo, {});
  const reason = "Synthetic retention verification of an unresolved refund.";
  const refund = await finance.requestRefund({
    operationId: randomUUID(),
    checkoutId: checkout.id,
    amountCents: 200,
    actorId: user,
    reason,
  });
  const hash = createHash("sha256").update(user).digest("hex");
  const contact = await repo.upsertContact(user, "email", `${user}@example.test`, true, hash);
  const consent = await repo.setConsent(user, "email", true, "fixture-v1");
  const delivery = randomUUID();
  await sql.query(
    `insert into app.deliveries(id,user_id,occurrence_key,channel,practice_id,content_version,profile_version,contact_id,contact_version,consent_id,destination_hash,payload,scheduled_at,expires_at,status,updated_at)
    values($1,$2,'held-refund-fixture','email','notice-your-neighbour','v1',1,$3,1,$4,$5,'{"body":"retained evidence"}','2020-01-01','2020-01-02','delivered','2020-01-01')`,
    [delivery, user, contact.id, consent, hash],
  );
  const beforeLedger = await sql.query("select * from app.credit_ledger order by id");
  await runRetention(db, { ...policy, batchSize: 500 }, { dryRun: false });
  assert.equal(
    (await sql.query("select payload_redacted_at from app.deliveries where id=$1", [delivery]))
      .rows[0].payload_redacted_at,
    null,
  );
  assert.deepEqual(
    (await sql.query("select * from app.credit_ledger order by id")).rows,
    beforeLedger.rows,
  );
  await finance.cancelAbsentRefund({ refundId: refund.id, actorId: user, reason });
  await runRetention(db, { ...policy, batchSize: 500 }, { dryRun: false });
  assert.ok(
    (await sql.query("select payload_redacted_at from app.deliveries where id=$1", [delivery]))
      .rows[0].payload_redacted_at,
  );
  assert.equal(
    (await sql.query("select count(*) from app.refund_operations where id=$1", [refund.id])).rows[0]
      .count,
    1,
  );
});
