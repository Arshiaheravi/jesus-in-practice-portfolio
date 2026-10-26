import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { consentVersion } from "../src/contracts.ts";
import { DeliveryStore } from "../src/operational.ts";
import { createTestDatabase } from "./helpers/database.mjs";
import { ContentRepository } from "../src/content-repository.ts";
import {
  corpusFixture,
  approvedRights,
  draftFixture,
  manualProvenance,
  approval,
} from "./content-fixtures.mjs";

let fixture;
let store;
before(async () => {
  fixture = await createTestDatabase();
  store = new DeliveryStore(fixture.repo);
});
after(async () => {
  await fixture?.close();
});

test("queued imported versions require the capability and stop before credit reservation after withdrawal", async () => {
  const repo = new ContentRepository(fixture.db, { rightsEnabled: true });
  const actor = fixture.userA;
  await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'editor')", [
    actor,
  ]);
  const corpus = corpusFixture("delivery-bom-fixture");
  await repo.registerEdition(corpus.manifest, actor);
  await repo.setEditionRights(corpus.manifest.id, approvedRights, actor);
  await repo.importCorpus(corpus.manifest.id, corpus.bytes, actor);
  const version = await repo.createDraft(
    {
      practiceId: "delivery-published-example",
      passage: {
        editionId: corpus.manifest.id,
        book: "mosiah",
        chapter: 2,
        fromVerse: 2,
        toVerse: 2,
      },
      draft: draftFixture,
      provenance: manualProvenance,
    },
    actor,
  );
  await repo.reviewDraft(version.id, approval, actor);
  await repo.publish(version.id, actor);
  const user = await readyMember();
  await fixture.repo.mutateMember(user, 2, {
    type: "preferences",
    source: "book-of-mormon",
    topics: [],
    channel: "sms",
    timezone: "America/Toronto",
  });
  const options = { practiceId: version.practiceId, contentVersion: version.id };
  const disabled = await enqueue(user, options);
  const disabledClaim = await claimOwn(disabled);
  assert.equal(await store.begin(disabled, disabledClaim.claimToken, 10), null);
  assert.equal((await store.get(disabled)).status, "cancelled");
  assert.equal((await fixture.repo.getState(user)).wallet.reservedCents, 0);
  const permitted = await enqueue(user, options);
  const permittedClaim = await claimOwn(permitted);
  assert.ok(await store.begin(permitted, permittedClaim.claimToken, 10, { allowPublished: true }));
  assert.equal((await fixture.repo.getState(user)).wallet.reservedCents, 10);
  await store.finish(permitted, "failed", "synthetic-provider-result");
  const withdrawn = await enqueue(user, options);
  const withdrawnClaim = await claimOwn(withdrawn);
  await repo.withdraw(version.id, "Synthetic withdrawal before provider submission.", actor);
  assert.equal(
    await store.begin(withdrawn, withdrawnClaim.claimToken, 10, { allowPublished: true }),
    null,
  );
  assert.equal((await store.get(withdrawn)).status, "cancelled");
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 100);
  assert.equal(wallet.reservedCents, 0);
});
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function readyMember(channel = "sms") {
  const userId = await fixture.createMember();
  await fixture.repo.mutateMember(userId, 1, {
    type: "onboarding",
    source: "bible",
    topics: [],
    channel,
    timezone: "America/Toronto",
    schedule: {
      mode: "fixed",
      times: ["08:00"],
      days: [0, 1, 2, 3, 4, 5, 6],
      windowStart: "09:00",
      windowEnd: "17:00",
      paused: false,
    },
  });
  const value =
    channel === "sms"
      ? `+1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`
      : `${userId}@example.test`;
  await fixture.repo.upsertContact(userId, channel, value, true, digest(value));
  await fixture.repo.setConsent(userId, channel, true, consentVersion(channel, 10));
  if (channel === "sms") {
    const checkout = await fixture.repo.createCheckout(userId, 100, randomUUID());
    await fixture.repo.fundCheckout({
      checkoutId: checkout.id,
      providerSessionId: `cs_${checkout.id}`,
      paymentIntentId: `pi_${checkout.id}`,
      amountCents: 100,
      currency: "cad",
      eventId: randomUUID(),
    });
  }
  return userId;
}
async function enqueue(userId, options = {}) {
  const channel = options.channel ?? "sms";
  const state = await fixture.repo.getState(userId);
  const context = await store.context(userId, channel);
  assert.ok(context);
  return store.enqueue({
    userId,
    occurrenceKey: options.occurrenceKey ?? randomUUID(),
    channel,
    practiceId: "notice-your-neighbour",
    contentVersion: "v1",
    profileVersion: state.profile.deliveryVersion,
    context,
    payload: {
      to: context.value,
      localDate: "2026-10-17",
      quoteCents: channel === "sms" ? 10 : 0,
      rateCents: 10,
      segments: 1,
      body: "Kindness, with a real reference.",
    },
    scheduledAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 600000),
    ...options,
  });
}
async function claimOwn(id) {
  const claims = await store.claim(25);
  const result = claims.find((row) => row.id === id);
  assert.ok(result, "expected due delivery to be claimed");
  return result;
}
async function start(id) {
  const claim = await claimOwn(id);
  assert.ok(await store.begin(id, claim.claimToken, 10));
  return claim;
}

test("occurrence enqueue deduplicates and claimed rows cannot be claimed twice or started with a stale token", async () => {
  const user = await readyMember();
  const occurrenceKey = randomUUID();
  const id = await enqueue(user, { occurrenceKey });
  assert.equal(await enqueue(user, { occurrenceKey }), null);
  const first = await claimOwn(id);
  assert.equal(
    (await store.claim()).some((row) => row.id === id),
    false,
  );
  assert.equal(await store.begin(id, randomUUID(), 10), null);
  assert.ok(await store.begin(id, first.claimToken, 10));
  assert.equal(await store.begin(id, first.claimToken, 10), null);
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 90);
  assert.equal(wallet.reservedCents, 10);
});

test("revoked consent prevents a previously queued message from starting", async () => {
  const user = await readyMember();
  const id = await enqueue(user);
  const claim = await claimOwn(id);
  await fixture.repo.setConsent(user, "sms", false, "test-v1");
  assert.equal(await store.begin(id, claim.claimToken, 10), null);
  assert.equal((await store.get(id)).status, "cancelled");
  assert.equal((await fixture.repo.getState(user)).wallet.reservedCents, 0);
});

test("queued SMS cannot charge a changed rate until fresh consent covers that rate", async () => {
  const user = await readyMember();
  const oldId = await enqueue(user);
  const claim = await claimOwn(oldId);
  assert.equal(await store.begin(oldId, claim.claimToken, 20), null);
  assert.equal((await store.get(oldId)).status, "cancelled");
  const before = (await fixture.repo.getState(user)).wallet;
  assert.equal(before.availableCents, 100);
  assert.equal(before.reservedCents, 0);
  assert.equal((await fixture.repo.listLedger(user)).total, 1);

  await fixture.repo.setConsent(user, "sms", true, consentVersion("sms", 20));
  assert.equal((await store.context(user, "sms")).consentVersion, consentVersion("sms", 20));
  const oldPayload = (await store.get(oldId)).payload;
  const currentId = await enqueue(user, {
    payload: { ...oldPayload, quoteCents: 20, rateCents: 20 },
  });
  const currentClaim = await claimOwn(currentId);
  assert.ok(await store.begin(currentId, currentClaim.claimToken, 20));
  assert.equal((await fixture.repo.getState(user)).wallet.reservedCents, 20);
  await store.finish(currentId, "delivered", "SM_current_consent_rate");
  const after = (await fixture.repo.getState(user)).wallet;
  assert.equal(after.availableCents, 80);
  assert.equal(after.reservedCents, 0);
});

test("queued work requires current consent wording even when the contact, consent ID and price are unchanged", async () => {
  const user = await readyMember();
  await fixture.repo.setConsent(user, "sms", true, "previous-terms:sms:10");
  const id = await enqueue(user);
  const claim = await claimOwn(id);
  assert.equal(await store.begin(id, claim.claimToken, 10), null);
  assert.equal((await store.get(id)).status, "cancelled");
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 100);
  assert.equal(wallet.reservedCents, 0);

  await fixture.repo.setConsent(user, "sms", true, consentVersion("sms", 10));
  const renewed = await enqueue(user);
  await start(renewed);
  await store.finish(renewed, "delivered", "SM_renewed_wording");
  assert.equal((await fixture.repo.getState(user)).wallet.availableCents, 90);
});

test("pausing or changing delivery preferences invalidates old jobs while saving a note does not", async () => {
  const paused = await readyMember();
  const pausedId = await enqueue(paused);
  const pausedClaim = await claimOwn(pausedId);
  const initial = await fixture.repo.getState(paused);
  await fixture.repo.mutateMember(paused, initial.profile.version, {
    type: "schedule",
    schedule: { ...initial.profile.schedule, paused: true },
    channel: "sms",
    timezone: "America/Toronto",
  });
  assert.equal(await store.begin(pausedId, pausedClaim.claimToken, 10), null);
  const changed = await readyMember();
  const changedId = await enqueue(changed);
  const changedClaim = await claimOwn(changedId);
  await fixture.repo.mutateMember(changed, 2, {
    type: "preferences",
    source: "book-of-mormon",
    topics: [],
    channel: "sms",
    timezone: "America/Toronto",
  });
  assert.equal(await store.begin(changedId, changedClaim.claimToken, 10), null);
  const noted = await readyMember();
  const notedId = await enqueue(noted);
  const notedClaim = await claimOwn(notedId);
  await fixture.repo.mutateMember(noted, 2, {
    type: "reflection",
    practiceId: "notice-your-neighbour",
    text: "A private thought",
  });
  assert.ok(await store.begin(notedId, notedClaim.claimToken, 10));
});

test("early delivered callback wins over a late accepted response without duplicate debit", async () => {
  const user = await readyMember();
  const id = await enqueue(user);
  await start(id);
  await store.finish(id, "delivered", "SM_early_callback");
  await store.finish(id, "submitted", "SM_early_callback");
  await store.finish(id, "delivered", "SM_early_callback");
  assert.equal((await store.get(id)).status, "delivered");
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 90);
  assert.equal(wallet.reservedCents, 0);
  const ledger = await fixture.repo.listLedger(user);
  assert.equal(ledger.items.filter((row) => row.kind === "settle").length, 1);
  await assert.rejects(
    store.finish(id, "delivered", "different-provider-id"),
    /identifier mismatch/i,
  );
});

test("known failed delivery releases its reservation once and late accepted responses do not revive it", async () => {
  const user = await readyMember();
  const id = await enqueue(user);
  await start(id);
  await store.finish(id, "failed", "SM_failed", "undelivered");
  await store.finish(id, "failed", "SM_failed", "undelivered");
  await store.finish(id, "submitted", "SM_failed");
  assert.equal((await store.get(id)).status, "failed");
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 100);
  assert.equal(wallet.reservedCents, 0);
});

test("unknown provider outcome keeps the reservation and is never claimed for automatic resend", async () => {
  const user = await readyMember();
  const id = await enqueue(user);
  await start(id);
  await store.finish(id, "unknown", undefined, "timeout");
  assert.equal(
    (await store.claim()).some((row) => row.id === id),
    false,
  );
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 90);
  assert.equal(wallet.reservedCents, 10);
});

test("a worker interrupted during sending moves to unknown and cannot cause a resend", async () => {
  const user = await readyMember("email");
  const id = await enqueue(user, { channel: "email" });
  await start(id);
  await fixture.db.withService((sql) =>
    sql.query("update app.deliveries set lease_until=now()-interval '1 minute' where id=$1", [id]),
  );
  assert.equal(
    (await store.claim()).some((row) => row.id === id),
    false,
  );
  assert.equal((await store.get(id)).status, "unknown");
  const attempt = await fixture.db.withService((sql) =>
    sql.query("select status from app.delivery_attempts where delivery_id=$1", [id]),
  );
  assert.equal(attempt.rows[0].status, "unknown");
});

test("expired queued jobs never send and the daily cap stops a fourth send", async () => {
  const expiredUser = await readyMember("email");
  const expired = await enqueue(expiredUser, {
    channel: "email",
    scheduledAt: new Date(Date.now() - 600000),
    expiresAt: new Date(Date.now() - 1000),
  });
  assert.equal(
    (await store.claim()).some((row) => row.id === expired),
    false,
  );
  assert.equal((await store.get(expired)).status, "cancelled");
  const user = await readyMember();
  for (let index = 0; index < 3; index++) {
    const id = await enqueue(user);
    await start(id);
    await store.finish(id, "delivered", `SM_daily_${index}`);
  }
  const fourth = await enqueue(user);
  const claim = await claimOwn(fourth);
  assert.equal(await store.begin(fourth, claim.claimToken, 10), null);
  assert.equal((await store.get(fourth)).status, "cancelled");
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 70);
  assert.equal(wallet.reservedCents, 0);
});

test("pending reconciliation moves behind unexamined deliveries without releasing their credit holds", async () => {
  const user = await readyMember();
  const ids = [];
  for (let index = 0; index < 3; index++) {
    const id = await enqueue(user);
    await start(id);
    await store.finish(id, "submitted", `SM_reconciliation_${index}`);
    await fixture.db.withService((sql) =>
      sql.query(
        "update app.deliveries set created_at=$2,updated_at=now()-interval '6 minutes' where id=$1",
        [id, new Date(Date.now() - (9 - index) * 60_000)],
      ),
    );
    ids.push(id);
  }

  const first = await store.unresolved(2);
  assert.deepEqual(
    first.map((delivery) => delivery.id),
    ids.slice(0, 2),
  );
  for (const delivery of first) await store.reconciled(delivery.id);

  const next = await store.unresolved(2);
  assert.deepEqual(
    next.map((delivery) => delivery.id),
    [ids[2]],
  );
  const attempts = await fixture.db.withService((sql) =>
    sql.query(
      "select id,last_reconcile_attempt_at is not null as attempted,next_reconcile_at>now() as deferred from app.deliveries where id=any($1::uuid[])",
      [ids.slice(0, 2)],
    ),
  );
  assert.equal(attempts.rows.length, 2);
  assert.ok(attempts.rows.every((row) => row.attempted && row.deferred));
  const wallet = (await fixture.repo.getState(user)).wallet;
  assert.equal(wallet.availableCents, 70);
  assert.equal(wallet.reservedCents, 30);

  // Once the retry delay passes, the still-pending messages become eligible again.
  await fixture.db.withService((sql) =>
    sql.query(
      "update app.deliveries set next_reconcile_at=now()-interval '1 second' where id=any($1::uuid[])",
      [ids.slice(0, 2)],
    ),
  );
  assert.deepEqual(new Set((await store.unresolved(3)).map((row) => row.id)), new Set(ids));
});

test("claiming an enabled channel leaves disabled-channel work queued and unleased", async () => {
  const smsUser = await readyMember();
  const emailUser = await readyMember("email");
  const smsId = await enqueue(smsUser);
  const emailId = await enqueue(emailUser, { channel: "email" });

  const claims = await store.claim(5, ["sms"]);
  assert.deepEqual(
    claims.map((row) => row.id),
    [smsId],
  );
  assert.equal((await store.get(emailId)).status, "queued");
  assert.equal((await store.get(emailId)).claimToken, null);
  assert.deepEqual(await store.claim(5, []), []);
  assert.equal((await store.get(emailId)).status, "queued");

  assert.ok(await store.begin(smsId, claims[0].claimToken, 10));
  await store.finish(smsId, "delivered", "SM_enabled_channel");
  const enabledLater = await store.claim(5, ["email"]);
  assert.deepEqual(
    enabledLater.map((row) => row.id),
    [emailId],
  );
  assert.ok(await store.begin(emailId, enabledLater[0].claimToken, 10));
  await store.finish(emailId, "delivered", "email_enabled_later");
});

test("a burst of 100 eligible members drains through bounded queue batches exactly once", async () => {
  const queuedIds = new Set();
  for (let index = 0; index < 100; index++) {
    const user = await readyMember("email");
    queuedIds.add(await enqueue(user, { channel: "email" }));
  }
  assert.equal(queuedIds.size, 100);

  const processedIds = new Set();
  let batches = 0;
  // This verifies database eligibility and batching, without provider calls or a throughput claim.
  for (;;) {
    const batch = await store.claim(5, ["email"]);
    if (batch.length === 0) break;
    batches++;
    assert.ok(batch.length <= 5);
    for (const claim of batch) {
      assert.ok(queuedIds.has(claim.id));
      assert.equal(processedIds.has(claim.id), false);
      assert.ok(await store.begin(claim.id, claim.claimToken, 10));
      await store.finish(claim.id, "delivered", `email_burst_${claim.id}`);
      processedIds.add(claim.id);
    }
  }

  assert.equal(batches, 20);
  assert.deepEqual(processedIds, queuedIds);
  const statuses = await fixture.db.withService((sql) =>
    sql.query(
      "select status,count(*)::int as total from app.deliveries where id=any($1::uuid[]) group by status",
      [[...queuedIds]],
    ),
  );
  assert.deepEqual(statuses.rows, [{ status: "delivered", total: 100 }]);
  assert.deepEqual(await store.claim(5, ["email"]), []);
});
