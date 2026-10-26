import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/database.mjs";
import { unsubscribeToken, readUnsubscribeToken } from "../src/tokens.ts";
import { practices } from "@jesus-in-practice/content";

// PGlite executes real PostgreSQL SQL/RLS in one embedded session. This adapter
// serializes transactions; it is NOT evidence of independent server-session races.
let pg;
let database;
let repository;
let fixture;
const digest = (value) => createHash("sha256").update(value).digest("hex");
before(async () => {
  fixture = await createTestDatabase();
  pg = fixture.sql;
  database = fixture.db;
  repository = fixture.repo;
});
after(async () => {
  if (database) await database.close();
});

async function member() {
  return fixture.createMember();
}
async function purchase(userId, amountCents = 500) {
  const checkout = await repository.createCheckout(userId, amountCents, randomUUID());
  const suffix = randomUUID();
  const payment = {
    checkoutId: checkout.id,
    providerSessionId: `cs_${suffix}`,
    paymentIntentId: `pi_${suffix}`,
    eventId: `evt_${suffix}`,
    amountCents,
    currency: "cad",
  };
  await repository.attachCheckoutSession(checkout.id, payment.providerSessionId);
  await repository.fundCheckout(payment);
  return { checkout, payment };
}
async function delivery(userId, channel = "sms") {
  const value =
    channel === "sms"
      ? `+1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`
      : `${userId}@example.test`;
  const contact = await repository.upsertContact(userId, channel, value, true, digest(value));
  const consentId = await repository.setConsent(userId, channel, true, "test-v1");
  return database.withService(
    async (sql) =>
      (
        await sql.query(
          `insert into app.deliveries(user_id,occurrence_key,channel,practice_id,content_version,profile_version,contact_id,contact_version,consent_id,destination_hash,payload,scheduled_at,expires_at) values($1,$2,$3,'practice-one','v1',1,$4,$5,$6,$7,'{}',now(),now()+interval '1 hour') returning id`,
          [
            userId,
            randomUUID(),
            channel,
            contact.id,
            contact.version,
            consentId,
            contact.destinationHash,
          ],
        )
      ).rows[0].id,
  );
}

test("RLS isolates two owners and prevents member financial/contact writes", async () => {
  const first = await member();
  const second = await member();
  await repository.mutateMember(first, 1, {
    type: "reflection",
    practiceId: practices[0].id,
    text: "Private first account reflection",
  });
  await repository.mutateMember(second, 1, {
    type: "reflection",
    practiceId: practices[0].id,
    text: "Private second account reflection",
  });
  const notes = await database.withUser(first, (sql) =>
    sql.query("select user_id,body from app.notes"),
  );
  assert.deepEqual(notes.rows, [{ user_id: first, body: "Private first account reflection" }]);
  await assert.rejects(
    database.withUser(first, (sql) =>
      sql.query("insert into app.notes(user_id,practice_id,body) values($1,'other','x')", [second]),
    ),
    /row-level security/i,
  );
  await assert.rejects(
    database.withUser(first, (sql) =>
      sql.query("update app.wallets set available_cents=999 where user_id=$1", [first]),
    ),
    /permission denied/i,
  );
  await assert.rejects(
    database.withUser(first, (sql) => sql.query("select * from app.phone_challenges")),
    /permission denied/i,
  );
  const role = await database.withService((sql) =>
    sql.query("select current_user as role,auth.uid() as user_id"),
  );
  assert.deepEqual(role.rows, [{ role: "service_role", user_id: null }]);
});

test("all member commands share revision checks while delivery revision changes only delivery preferences", async () => {
  const user = await member();
  const results = await Promise.allSettled([
    repository.mutateMember(user, 1, {
      type: "reflection",
      practiceId: practices[0].id,
      text: "One",
    }),
    repository.mutateMember(user, 1, {
      type: "reflection",
      practiceId: practices[1].id,
      text: "Two",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "conflict");
  let state = await repository.getState(user);
  assert.equal(state.profile.version, 2);
  assert.equal(state.profile.deliveryVersion, 1);
  await repository.mutateMember(user, 2, {
    type: "preferences",
    source: "bible",
    topics: [],
    channel: "email",
    timezone: "America/Vancouver",
  });
  state = await repository.getState(user);
  assert.equal(state.profile.version, 3);
  assert.equal(state.profile.deliveryVersion, 2);
  await assert.rejects(
    repository.mutateMember(user, 3, {
      type: "reflection",
      practiceId: practices[0].id,
      text: "x".repeat(1501),
    }),
    /check constraint/i,
  );
  assert.equal(
    (await repository.getState(user)).profile.version,
    3,
    "failed mutation rolls back the global revision",
  );
});

test("completion history paginates without dropping same-date entries and exports all rows", async () => {
  const user = await member();
  for (let index = 0; index < 105; index++)
    await repository.mutateMember(user, index + 1, {
      type: "completion",
      practiceId: practices[index % practices.length].id,
      date: `2026-10-${String(17 - Math.floor(index / practices.length)).padStart(2, "0")}`,
      completed: true,
    });
  const first = await repository.listHistory(user, { limit: 60 });
  const second = await repository.listHistory(user, { limit: 60, cursor: first.nextCursor });
  assert.equal(first.total, 105);
  assert.equal(first.items.length, 60);
  assert.equal(second.items.length, 45);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 105);
  assert.equal(second.hasMore, false);
  assert.equal((await repository.getState(user)).completions.items.length, 100);
  assert.equal((await repository.exportUserData(user)).completions.length, 105);
});

test("contact verification never grants consent and provider suppression is not cleared by a checkbox", async () => {
  const user = await member();
  const value = `${user}@example.test`;
  await repository.upsertContact(user, "email", value, true, digest(value));
  assert.equal((await repository.getState(user)).contacts[0].consentGranted, false);
  await repository.setConsent(user, "email", true, "test-v1");
  await repository.suppressDestination("email", digest(value), "hard-bounce");
  await assert.rejects(
    repository.setConsent(user, "email", true, "test-v1"),
    (error) => error.code === "contact_suppressed",
  );
  assert.equal((await repository.getState(user)).contacts[0].consentGranted, false);
});

test("an old unsubscribe link suppresses its original destination after the contact is replaced", async () => {
  const user = await member();
  const oldValue = `old-${user}@example.test`;
  const newValue = `new-${user}@example.test`;
  const original = await repository.upsertContact(user, "email", oldValue, true, digest(oldValue));
  const token = unsubscribeToken("s".repeat(32), original.id, "email", original.destinationHash);
  const replacement = await repository.upsertContact(
    user,
    "email",
    newValue,
    true,
    digest(newValue),
  );
  assert.equal(replacement.id, original.id, "a contact row can change its destination");
  await repository.setConsent(user, "email", true, "test-v1");
  const decoded = readUnsubscribeToken("s".repeat(32), token);
  await repository.suppressDestination(decoded.channel, decoded.destinationHash, "unsubscribe");
  const current = (await repository.getState(user)).contacts[0];
  assert.equal(current.value, newValue);
  assert.equal(current.consentGranted, true);
  const suppressed = await database.withService((sql) =>
    sql.query(
      "select destination_hash from app.suppressions where channel='email' and destination_hash in ($1,$2)",
      [digest(oldValue), digest(newValue)],
    ),
  );
  assert.deepEqual(suppressed.rows, [{ destination_hash: digest(oldValue) }]);
});

test("phone verification atomically consumes only the current unexpired provider challenge", async () => {
  const user = await member();
  const phone = "+14165550123";
  await repository.setPhoneChallenge(user, {
    phone,
    challengeId: "new-challenge",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  await assert.rejects(
    repository.completePhoneChallenge(user, "old-challenge", digest(phone)),
    (error) => error.code === "challenge_expired",
  );
  assert.equal((await repository.getPhoneChallenge(user)).challengeId, "new-challenge");
  const contact = await repository.completePhoneChallenge(user, "new-challenge", digest(phone));
  assert.equal(contact.value, phone);
  assert.equal(contact.consentGranted, false);
  assert.ok(contact.verifiedAt);
  assert.equal(await repository.getPhoneChallenge(user), null);
  await assert.rejects(
    repository.completePhoneChallenge(user, "new-challenge", digest(phone)),
    (error) => error.code === "challenge_expired",
  );
});

test("checkout and funding are idempotent and reject changed owner, amount or provider identity", async () => {
  const user = await member();
  const other = await member();
  const operationId = randomUUID();
  const checkout = await repository.createCheckout(user, 500, operationId);
  assert.equal((await repository.createCheckout(user, 500, operationId)).id, checkout.id);
  await assert.rejects(
    repository.createCheckout(user, 501, operationId),
    (error) => error.code === "checkout_conflict",
  );
  await assert.rejects(
    repository.createCheckout(other, 500, operationId),
    (error) => error.code === "checkout_conflict",
  );
  const payment = {
    checkoutId: checkout.id,
    providerSessionId: `cs_${operationId}`,
    paymentIntentId: `pi_${operationId}`,
    eventId: "first-event",
    amountCents: 500,
    currency: "cad",
  };
  const first = await repository.fundCheckout(payment);
  const duplicate = await repository.fundCheckout({ ...payment, eventId: "second-event" });
  assert.equal(first.funded, true);
  assert.equal(duplicate.funded, false);
  assert.equal(duplicate.wallet.availableCents, 500);
  await assert.rejects(
    repository.fundCheckout({ ...payment, amountCents: 501 }),
    (error) => error.code === "payment_mismatch",
  );
  assert.equal((await repository.listLedger(user)).items.length, 1);
  await assert.rejects(
    database.withService((sql) => sql.query("delete from app.credit_ledger")),
    /permission denied|immutable/i,
  );
});

test("verified checkout expiration arriving before session attachment resolves a pending purchase", async () => {
  const user = await member();
  const checkout = await repository.createCheckout(user, 100, randomUUID());
  const sessionId = `cs_${checkout.id}`;
  assert.equal(checkout.providerSessionId, null);
  await repository.expireCheckout(checkout.id, sessionId);
  await repository.expireCheckout(checkout.id, sessionId);
  const expired = await repository.getCheckout(checkout.id);
  assert.equal(expired.status, "expired");
  assert.equal(expired.providerSessionId, sessionId);
  await assert.rejects(
    repository.expireCheckout(checkout.id, "cs_different"),
    (error) => error.code === "checkout_conflict",
  );
  await repository.prepareAccountDeletion(user);
  const funded = await member();
  const { checkout: paid, payment } = await purchase(funded, 100);
  await repository.expireCheckout(paid.id, payment.providerSessionId);
  assert.equal(
    (await repository.getCheckout(paid.id)).status,
    "paid",
    "late expiration cannot revoke a recorded payment",
  );
});

test("SMS reservations cannot overspend; settlement and release are idempotent exclusive final states", async () => {
  const user = await member();
  await purchase(user, 100);
  const first = await delivery(user);
  const second = await delivery(user);
  await repository.reserveCredits(user, first, 70);
  await repository.reserveCredits(user, first, 70);
  await assert.rejects(
    repository.reserveCredits(user, second, 40),
    (error) => error.code === "insufficient_funds",
  );
  let wallet = (await repository.getState(user)).wallet;
  assert.equal(wallet.availableCents, 30);
  assert.equal(wallet.reservedCents, 70);
  await repository.releaseCredits(first);
  await repository.releaseCredits(first);
  await assert.rejects(
    repository.settleCredits(first),
    (error) => error.code === "reservation_final",
  );
  await repository.reserveCredits(user, second, 40);
  await repository.settleCredits(second);
  await repository.settleCredits(second);
  wallet = (await repository.getState(user)).wallet;
  assert.equal(wallet.availableCents, 60);
  assert.equal(wallet.reservedCents, 0);
  const sum = await database.withService((sql) =>
    sql.query(
      "select sum(available_delta)::int as available,sum(reserved_delta)::int as reserved from app.credit_ledger where wallet_id=$1",
      [wallet.id],
    ),
  );
  assert.deepEqual(sum.rows, [{ available: 60, reserved: 0 }]);
});

test("financial incidents arriving before funding freeze future SMS reservations", async () => {
  const user = await member();
  const checkout = await repository.createCheckout(user, 100, randomUUID());
  const paymentIntentId = `pi_${randomUUID()}`;
  await repository.restrictWalletByPaymentIntent({
    paymentIntentId,
    eventId: `evt_${randomUUID()}`,
    kind: "refund",
    amountCents: 100,
  });
  await repository.fundCheckout({
    checkoutId: checkout.id,
    providerSessionId: `cs_${randomUUID()}`,
    paymentIntentId,
    eventId: "fund-event",
    amountCents: 100,
    currency: "cad",
  });
  assert.equal((await repository.getState(user)).wallet.blockedReason, "payment_refund");
  const id = await delivery(user);
  await assert.rejects(
    repository.reserveCredits(user, id, 10),
    (error) => error.code === "wallet_blocked",
  );
});

test("durable limits stop at the configured budget and webhook retries retain processing state", async () => {
  const key = `auth:${randomUUID()}`;
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, () =>
      repository.consumeRateLimit({ key, limit: 3, windowSeconds: 3600 }),
    ),
  );
  assert.deepEqual(outcomes, [true, true, true, false, false]);
  const id = randomUUID();
  assert.deepEqual(await repository.recordWebhook("provider", id, digest("body")), {
    processed: false,
  });
  assert.deepEqual(await repository.recordWebhook("provider", id, digest("body")), {
    processed: false,
  });
  await repository.completeWebhook("provider", id);
  assert.deepEqual(await repository.recordWebhook("provider", id, digest("body")), {
    processed: true,
  });
  await assert.rejects(
    repository.recordWebhook("provider", id, digest("different")),
    (error) => error.code === "event_conflict",
  );
});

test("deletion refuses unresolved finances and a failed auth deletion leaves an unusable pending account", async () => {
  const funded = await member();
  await purchase(funded, 100);
  await assert.rejects(
    repository.prepareAccountDeletion(funded),
    (error) => error.code === "account_financial_review",
  );
  const user = await member();
  await repository.mutateMember(user, 1, {
    type: "reflection",
    practiceId: practices[0].id,
    text: "Private note",
  });
  const walletId = (await repository.getState(user)).wallet.id;
  await repository.prepareAccountDeletion(user);
  await repository.prepareAccountDeletion(user);
  await repository.ensureProfile(user);
  await assert.rejects(repository.getState(user), (error) => error.code === "account_deleting");
  await assert.rejects(
    repository.mutateMember(user, 3, { type: "saved", practiceId: "one", saved: true }),
    (error) => error.code === "account_deleting",
  );
  // Simulates Auth admin deletion locally; no actual Supabase Auth service is involved.
  await pg.query("delete from auth.users where id=$1", [user]);
  assert.equal(
    (await pg.query("select count(*)::int as n from app.notes where user_id=$1", [user])).rows[0].n,
    0,
  );
  assert.equal(
    (await pg.query("select user_id from app.wallets where id=$1", [walletId])).rows[0].user_id,
    null,
  );
});

test("account deletion preserves detached financial evidence after all funds are resolved", async () => {
  const user = await member();
  const other = await member();
  const pending = await repository.createCheckout(user, 100, randomUUID());
  await assert.rejects(
    repository.prepareAccountDeletion(user),
    (error) => error.code === "account_financial_review",
  );
  const providerSessionId = `cs_${pending.id}`;
  await repository.fundCheckout({
    checkoutId: pending.id,
    providerSessionId,
    paymentIntentId: `pi_${pending.id}`,
    eventId: randomUUID(),
    amountCents: 100,
    currency: "cad",
  });
  const id = await delivery(user);
  await repository.reserveCredits(user, id, 100);
  await repository.settleCredits(id);
  await database.withService((sql) =>
    sql.query("update app.deliveries set status='delivered' where id=$1", [id]),
  );
  const walletId = (await repository.getState(user)).wallet.id;
  assert.equal(
    (await repository.listLedger(other)).total,
    0,
    "another owner cannot read the ledger",
  );
  await repository.prepareAccountDeletion(user);
  await pg.query("delete from auth.users where id=$1", [user]);
  const financial = await pg.query(
    "select count(*)::int as total from app.credit_ledger where wallet_id=$1",
    [walletId],
  );
  assert.equal(financial.rows[0].total, 3);
  assert.equal(
    (await pg.query("select user_id from app.wallets where id=$1", [walletId])).rows[0].user_id,
    null,
  );
  assert.equal(
    (await pg.query("select count(*)::int as total from app.contacts where user_id=$1", [user]))
      .rows[0].total,
    0,
  );
  assert.equal(
    (await pg.query("select count(*)::int as total from app.deliveries where user_id=$1", [user]))
      .rows[0].total,
    0,
  );
});

test("a complaint persisted after account deletion blocks fresh consent when the address registers again", async () => {
  const originalUser = await member();
  const address = `${originalUser}@example.test`;
  const destinationHash = digest(address);
  const deliveryId = await delivery(originalUser, "email");
  await database.withService((sql) =>
    sql.query("update app.deliveries set status='delivered' where id=$1", [deliveryId]),
  );

  await repository.prepareAccountDeletion(originalUser);
  // Local Auth deletion fixture: the original contact and delivery are now absent.
  await pg.query("delete from auth.users where id=$1", [originalUser]);
  assert.equal(
    (await pg.query("select count(*)::int as total from app.deliveries where id=$1", [deliveryId]))
      .rows[0].total,
    0,
  );
  const suppressionReason = async () =>
    (
      await database.withService((sql) =>
        sql.query(
          "select reason from app.suppressions where channel='email' and destination_hash=$1",
          [destinationHash],
        ),
      )
    ).rows[0].reason;
  assert.equal(await suppressionReason(), "unsubscribe");

  // Simulates the repository action after a verified complaint. No HTTP or signature claim here.
  await repository.suppressDestination("email", destinationHash, "email.complained");
  assert.equal(await suppressionReason(), "email.complained");

  const replacementUser = await member();
  await pg.query("update auth.users set email=$2 where id=$1", [replacementUser, address]);
  await repository.upsertContact(replacementUser, "email", address, true, destinationHash);
  await assert.rejects(
    repository.setConsent(replacementUser, "email", true, "test-v2"),
    (error) => error.code === "contact_suppressed",
  );
  assert.equal((await repository.getState(replacementUser)).contacts[0].consentGranted, false);
  assert.equal(await suppressionReason(), "email.complained");
});
