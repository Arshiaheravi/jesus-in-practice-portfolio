import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { DeliverySupport } from "../src/delivery-support.ts";
import { DeliveryStore } from "../src/operational.ts";
import { OperatorRepository, assertOperator, recordOperatorAudit } from "../src/operators.ts";
import { createTestDatabase } from "./helpers/database.mjs";

test("operator roles are explicit, revocable and inaccessible to member SQL", async () => {
  const fixture = await createTestDatabase();
  try {
    const operators = new OperatorRepository(fixture.db);
    await assert.rejects(() => operators.role(fixture.userA), { code: "operator_required" });
    await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'editor')", [
      fixture.userA,
    ]);
    assert.equal(await operators.role(fixture.userA), "editor");
    await assert.rejects(() => operators.cases(fixture.userA), { code: "operator_required" });
    await assert.rejects(
      () =>
        fixture.db.withUser(fixture.userB, (sql) => sql.query("select * from app.operator_roles")),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        fixture.db.withService((sql) => sql.query("update app.operator_roles set role='admin'")),
      /permission denied/,
    );
    await fixture.sql.query("update app.operator_roles set active=false where user_id=$1", [
      fixture.userA,
    ]);
    await assert.rejects(() => operators.role(fixture.userA), { code: "operator_required" });
  } finally {
    await fixture.close();
  }
});
test("operator audit survives actor deletion and cannot be rewritten", async () => {
  const fixture = await createTestDatabase();
  try {
    await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [
      fixture.userA,
    ]);
    await fixture.db.withService(async (sql) => {
      const role = await assertOperator(sql, fixture.userA, ["admin"]);
      await recordOperatorAudit(sql, {
        actorId: fixture.userA,
        role,
        action: "test.review",
        targetType: "test",
        targetId: fixture.userB,
        reason: "Reviewed a synthetic test record.",
      });
    });
    await assert.rejects(
      () => fixture.db.withService((sql) => sql.query("delete from app.operator_audit")),
      /permission denied/,
    );
    await fixture.sql.query("delete from auth.users where id=$1", [fixture.userA]);
    assert.equal(
      (await fixture.sql.query("select count(*)::int as total from app.operator_audit")).rows[0]
        .total,
      1,
    );
  } finally {
    await fixture.close();
  }
});

test("waived unknown deliveries cannot crowd a held case out of the bounded review queue", async () => {
  const fixture = await createTestDatabase();
  try {
    const { repo, userA: admin, userB: member } = fixture;
    await fixture.sql.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [
      admin,
    ]);
    const checkout = await repo.createCheckout(member, 100, randomUUID());
    await repo.fundCheckout({
      checkoutId: checkout.id,
      providerSessionId: "cs_queue_fixture",
      paymentIntentId: "pi_queue_fixture",
      eventId: "evt_queue_fixture",
      amountCents: 100,
      currency: "cad",
    });
    const store = new DeliveryStore(repo);
    const support = new DeliverySupport(repo, { commercePolicyApproved: true });
    async function uncertain(channel) {
      const value = channel === "sms" ? "+14165550123" : "queue@example.test";
      await repo.upsertContact(
        member,
        channel,
        value,
        true,
        createHash("sha256").update(value).digest("hex"),
      );
      await repo.setConsent(member, channel, true, "fixture");
      const id = await store.enqueue({
        userId: member,
        occurrenceKey: randomUUID(),
        channel,
        practiceId: "notice-your-neighbour",
        contentVersion: "fixture",
        profileVersion: 1,
        context: await store.context(member, channel),
        payload: { to: value, localDate: "2026-10-17", quoteCents: 1, rateCents: 1, segments: 1 },
        scheduledAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      if (channel === "sms") await repo.reserveCredits(member, id, 1);
      await fixture.sql.query("update app.deliveries set status='unknown' where id=$1", [id]);
      return id;
    }
    const waived = [];
    for (let index = 0; index < 51; index++) {
      const id = await uncertain("sms");
      await support.waiveUnknownDelivery({
        operationId: randomUUID(),
        deliveryId: id,
        actorId: admin,
        reason: "Synthetic review: the merchant accepts this uncertain message cost.",
        confirmed: true,
      });
      waived.push(id);
    }
    await fixture.sql.query(
      "update app.deliveries set updated_at=now()-interval '1 day' where id=any($1::uuid[])",
      [waived],
    );
    const heldId = await uncertain("sms");
    const emailId = await uncertain("email");
    const cases = await new OperatorRepository(fixture.db).cases(admin);
    assert.deepEqual(new Set(cases.deliveries.map((row) => row.id)), new Set([heldId, emailId]));
    assert.equal(cases.deliveries.find((row) => row.id === heldId).creditState, "held");
    assert.equal(cases.deliveries.find((row) => row.id === emailId).creditState, null);
    assert.equal(
      (
        await fixture.sql.query(
          "select count(*)::int as total from app.deliveries where id=any($1::uuid[]) and status='unknown'",
          [waived],
        )
      ).rows[0].total,
      51,
      "Excluding financial waivers must not rewrite uncertain delivery evidence",
    );
  } finally {
    await fixture.close();
  }
});
