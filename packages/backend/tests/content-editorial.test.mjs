import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { practices } from "@jesus-in-practice/content";
import { ContentRepository } from "../src/content-repository.ts";
import { sha256 } from "../src/content-corpus.ts";
import { createTestDatabase } from "./helpers/database.mjs";
import {
  corpusFixture,
  approvedRights,
  draftFixture,
  passageFixture,
  manualProvenance,
  approval,
} from "./content-fixtures.mjs";

test("editorial lifecycle enforces rights, operator authority, review and immutable publication evidence", async () => {
  const fixture = await createTestDatabase();
  const { db, sql, userA, userB } = fixture;
  const repo = new ContentRepository(db, { rightsEnabled: true });
  const source = corpusFixture();
  try {
    await assert.rejects(repo.registerEdition(source.manifest, userA), {
      code: "operator_required",
    });
    await sql.query(
      "insert into app.operator_roles(user_id,role) values($1,'editor'),($2,'support')",
      [userA, userB],
    );
    await assert.rejects(repo.registerEdition(source.manifest, userB), {
      code: "operator_required",
    });
    await repo.registerEdition(source.manifest, userA);
    assert.equal((await repo.listEditions(userA)).total, 1);
    await assert.rejects(repo.importCorpus(source.manifest.id, source.bytes, userA), {
      code: "RIGHTS_REQUIRED",
    });
    await repo.setEditionRights(source.manifest.id, approvedRights, userA);
    await assert.rejects(
      new ContentRepository(db).importCorpus(source.manifest.id, source.bytes, userA),
      { code: "RIGHTS_DISABLED" },
    );
    assert.equal(
      (await repo.importCorpus(source.manifest.id, source.bytes, userA)).alreadyImported,
      false,
    );
    assert.equal(
      (await repo.importCorpus(source.manifest.id, source.bytes, userA)).alreadyImported,
      true,
    );
    const passage = await repo.retrievePassage(passageFixture, { forAi: true });
    assert.equal(passage.reference, "mosiah 2:2");
    assert.equal(passage.verses.length, 1);
    assert.deepEqual(
      passage.context.map((v) => v.verse),
      [1, 3],
    );
    assert.equal(passage.sourceUrl, "https://example.test/mosiah/2#2");
    await assert.rejects(repo.retrievePassage({ ...passageFixture, toVerse: 4 }), {
      code: "PASSAGE_INVALID",
    });
    assert.equal((await repo.coverage(source.manifest.id)).complete, true);
    assert.equal((await repo.listPublished()).total, 0);
    const input = {
      practiceId: "test-help",
      passage: passageFixture,
      draft: draftFixture,
      provenance: manualProvenance,
    };
    const first = await repo.createDraft(input, userA);
    assert.throws(
      () => repo.createDraft({ ...input, practiceId: "notice-your-neighbour" }, userA),
      { code: "PRACTICE_RESERVED" },
    );
    assert.throws(
      () =>
        repo.listDrafts(userA, {
          cursor: Buffer.from(JSON.stringify("not-a-uuid")).toString("base64url"),
        }),
      { code: "INVALID_CURSOR" },
    );
    await assert.rejects(repo.publish(first.id, userA), { code: "REVIEW_REQUIRED" });
    await assert.rejects(async () =>
      repo.reviewDraft(
        first.id,
        { ...approval, checks: { ...approval.checks, context: false } },
        userA,
      ),
    );
    await repo.reviewDraft(first.id, approval, userA);
    assert.equal((await repo.listReviews(first.id, userA)).total, 1);
    await repo.publish(first.id, userA);
    const competing = practices.filter(
      (item) => item.source === "book-of-mormon" && item.category === "Service",
    );
    const hash = (key, id) => createHash("md5").update(`${key}:${id}`).digest("hex");
    const selectionKey = Array.from({ length: 500 }, (_, index) => `occurrence-${index}`).find(
      (key) => competing.every((item) => hash(key, "test-help") < hash(key, item.id)),
    );
    assert.ok(selectionKey);
    const selected = await repo.selectForDelivery(
      { source: "book-of-mormon", topics: ["Service"] },
      selectionKey,
      "sms",
    );
    assert.equal(selected.versionId, first.id);
    assert.equal(
      (
        await repo.selectForDelivery(
          { source: "book-of-mormon", topics: ["Service"] },
          selectionKey,
          "email",
        )
      ).id,
      selected.id,
    );
    assert.equal(
      (
        await db.withService((s) =>
          s.query("select app.content_version_available($1,'sms') as available", [first.id]),
        )
      ).rows[0].available,
      true,
    );
    await assert.rejects(
      db.withUser(userB, (s) =>
        s.query("select app.content_version_available($1,'sms')", [first.id]),
      ),
      /permission denied/,
    );
    await assert.rejects(
      fixture.repo.mutateMember(userB, 1, { type: "saved", practiceId: "test-help", saved: true }),
      { code: "practice_unavailable" },
    );
    await assert.rejects(
      fixture.repo.mutateMember(
        userB,
        1,
        { type: "saved", practiceId: "invented-practice", saved: true },
        { allowPublished: true },
      ),
      { code: "practice_unavailable" },
    );
    await fixture.repo.mutateMember(
      userB,
      1,
      { type: "saved", practiceId: "test-help", saved: true },
      { allowPublished: true },
    );
    assert.deepEqual((await fixture.repo.getState(userB)).saved, ["test-help"]);
    const published = await repo.getPublished("test-help", "sms");
    assert.equal(published.versionId, first.id);
    assert.match(published.smsText, /Book of Mormon · mosiah 2:2/);
    assert.equal((await repo.coverage(source.manifest.id)).publishedPassageVerses, 1);
    await assert.rejects(repo.reviewDraft(first.id, approval, userA), { code: "VERSION_LOCKED" });
    await assert.rejects(
      db.withService((s) =>
        s.query("update app.content_versions set draft='{}' where id=$1", [first.id]),
      ),
    );
    await assert.rejects(
      db.withUser(userA, (s) => s.query("select * from app.content_versions")),
      /permission denied/,
    );
    const second = await repo.createDraft(
      { ...input, draft: { ...draftFixture, title: "A revised practical action" } },
      userA,
    );
    assert.equal(second.revision, 2);
    await repo.reviewDraft(second.id, approval, userA);
    await repo.publish(second.id, userA);
    assert.equal(await repo.getPublishedVersion(first.id), null);
    assert.equal((await repo.getVersion(first.id, userA)).draft.title, draftFixture.title);
    const page = await repo.listDrafts(userA, { limit: 1 });
    assert.equal(page.items.length, 1);
    assert.ok(page.nextCursor);
    const next = await repo.listDrafts(userA, { limit: 1, cursor: page.nextCursor });
    assert.notEqual(page.items[0].id, next.items[0].id);
    assert.equal(next.nextCursor, null);
    await repo.withdraw(second.id, "Correction required after editorial review.", userA);
    assert.equal(
      (
        await db.withService((s) =>
          s.query("select app.content_version_available($1,'sms') as available", [second.id]),
        )
      ).rows[0].available,
      false,
    );
    await assert.rejects(
      fixture.repo.mutateMember(
        userB,
        2,
        { type: "reflection", practiceId: "test-help", text: "New note" },
        { allowPublished: true },
      ),
      { code: "practice_unavailable" },
    );
    await fixture.repo.mutateMember(userB, 2, {
      type: "saved",
      practiceId: "test-help",
      saved: false,
    });
    assert.deepEqual((await fixture.repo.getState(userB)).saved, []);
    assert.equal(await repo.getPublished("test-help"), null);
    await assert.rejects(repo.publish(second.id, userA), { code: "REVIEW_REQUIRED" });
    await sql.query("update app.operator_roles set active=false where user_id=$1", [userA]);
    await assert.rejects(repo.createDraft(input, userA), { code: "operator_required" });
  } finally {
    await fixture.close();
  }
});
test("failed complete-inventory import is atomic; rights revocation hides publication and AI rights are separate", async () => {
  const fixture = await createTestDatabase();
  const { db, sql, userA } = fixture;
  const repo = new ContentRepository(db, { rightsEnabled: true });
  try {
    await sql.query("insert into app.operator_roles(user_id,role) values($1,'admin')", [userA]);
    const source = corpusFixture();
    const bytes = Buffer.from(JSON.stringify({ verses: source.verses.slice(1) }));
    const incomplete = { ...source.manifest, id: "incomplete", artifactSha256: sha256(bytes) };
    await repo.registerEdition(incomplete, userA);
    await repo.setEditionRights(incomplete.id, approvedRights, userA);
    await assert.rejects(repo.importCorpus(incomplete.id, bytes, userA), {
      code: "INVENTORY_INCOMPLETE",
    });
    const incompleteCoverage = await repo.coverage(incomplete.id);
    assert.equal(incompleteCoverage.complete, false);
    assert.equal(incompleteCoverage.imported.verses, 0);
    await repo.registerEdition(source.manifest, userA);
    await repo.setEditionRights(
      source.manifest.id,
      { ...approvedRights, allowedUses: approvedRights.allowedUses.filter((use) => use !== "ai") },
      userA,
    );
    await repo.importCorpus(source.manifest.id, source.bytes, userA);
    await assert.rejects(repo.retrievePassage(passageFixture, { forAi: true }), {
      code: "RIGHTS_REQUIRED",
    });
    const version = await repo.createDraft(
      {
        practiceId: "one",
        passage: passageFixture,
        draft: draftFixture,
        provenance: manualProvenance,
      },
      userA,
    );
    await repo.reviewDraft(version.id, approval, userA);
    await repo.publish(version.id, userA);
    assert.equal((await repo.listPublished()).total, 1);
    assert.equal((await repo.listPublished({ source: "bible" })).total, 0);
    assert.equal((await repo.listPublished({ topics: ["Rest"] })).total, 0);
    assert.equal((await repo.listPublished({ search: "GROCERIES" })).total, 1);
    assert.equal(
      (await repo.listPublished({ search: "%" })).total,
      0,
      "Search treats wildcard characters literally.",
    );
    assert.equal((await repo.listPublished({ ids: [] })).total, 0);
    assert.equal((await repo.listPublished({ ids: ["one"] })).total, 1);
    await repo.setEditionRights(
      source.manifest.id,
      { ...approvedRights, territories: ["US"] },
      userA,
    );
    assert.equal((await repo.listPublished()).total, 0);
    assert.equal(await repo.getPublished("one"), null);
    await assert.rejects(repo.retrievePassage(passageFixture), { code: "RIGHTS_REQUIRED" });
    await repo.setEditionRights(
      source.manifest.id,
      { ...approvedRights, expiresAt: "2000-01-01T00:00:00.000Z" },
      userA,
    );
    assert.equal((await repo.listPublished()).total, 0);
    await repo.setEditionRights(
      source.manifest.id,
      { ...approvedRights, allowedUses: approvedRights.allowedUses.filter((use) => use !== "sms") },
      userA,
    );
    assert.equal((await repo.listPublished({ use: "display" })).total, 1);
    assert.equal((await repo.listPublished({ use: "sms" })).total, 0);
    assert.equal(await repo.getPublishedVersion(version.id, "sms"), null);
    await repo.setEditionRights(source.manifest.id, { ...approvedRights, approved: false }, userA);
    assert.equal((await repo.listPublished()).total, 0);
    assert.equal(await repo.getPublished("one"), null);
    await repo.setEditionRights(source.manifest.id, approvedRights, userA);
    assert.equal(
      (await repo.listPublished()).total,
      0,
      "Reapproval must not silently republish withdrawn source rights.",
    );
  } finally {
    await fixture.close();
  }
});
