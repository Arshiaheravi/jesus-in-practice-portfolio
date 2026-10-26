import test from "node:test";
import assert from "node:assert/strict";
import { practices } from "@jesus-in-practice/content";
import { readCatalog } from "../src/content-catalog.ts";
test("a shared cursor merges published and bundled records without duplicates or missing boundary entries", async () => {
  const custom = [
    { ...practices[0], id: "aaa-published" },
    { ...practices[0], id: "listen-a-published" },
    { ...practices[0], id: "zzz-published" },
  ];
  const repo = {
    async listPublished({ cursor, limit }) {
      const after = cursor ? JSON.parse(Buffer.from(cursor, "base64url").toString()) : null;
      const remaining = custom.filter((item) => !after || item.id > after);
      return {
        items: remaining.slice(0, limit),
        total: custom.length,
        nextCursor:
          remaining.length > limit
            ? Buffer.from(JSON.stringify(remaining[limit - 1].id)).toString("base64url")
            : null,
      };
    },
  };
  const seen = [];
  let cursor;
  do {
    const page = await readCatalog(repo, { limit: 3, cursor });
    assert.equal(page.total, 27);
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(seen.length, 27);
  assert.equal(new Set(seen).size, 27);
  assert.deepEqual(seen, [...practices, ...custom].map((item) => item.id).sort());
});
test("bundled search/source/topic/saved filtering is independent of loaded pages", async () => {
  const repo = {
    async listPublished() {
      return { items: [], total: 0, nextCursor: null };
    },
  };
  const page = await readCatalog(repo, { source: "bible", q: "GROCERIES" });
  assert.ok(page.items.length > 0);
  assert.ok(page.items.every((item) => item.source === "bible"));
  assert.equal((await readCatalog(repo, {}, [])).total, 0);
  await assert.rejects(readCatalog(repo, { cursor: "not-json" }), { code: "INVALID_CURSOR" });
});
