import test from "node:test";
import assert from "node:assert/strict";
import { editionManifestSchema } from "../src/content-contracts.ts";
import { validateCorpus, sha256, inventoryCounts } from "../src/content-corpus.ts";
import { corpusFixture } from "./content-fixtures.mjs";
test("a complete independently specified inventory and exact checksum are required", () => {
  const { manifest, bytes, verses } = corpusFixture();
  const result = validateCorpus(manifest, bytes);
  assert.equal(result.verses.length, 717);
  assert.deepEqual(inventoryCounts(manifest), { books: 15, chapters: 239, verses: 717 });
  assert.throws(() => validateCorpus(manifest, Buffer.concat([bytes, Buffer.from(" ")])), {
    code: "CHECKSUM_MISMATCH",
  });
  const missing = Buffer.from(JSON.stringify({ verses: verses.slice(1) }));
  assert.throws(() => validateCorpus({ ...manifest, artifactSha256: sha256(missing) }, missing), {
    code: "INVENTORY_INCOMPLETE",
  });
  const duplicate = Buffer.from(JSON.stringify({ verses: [...verses.slice(1), verses[1]] }));
  assert.throws(
    () => validateCorpus({ ...manifest, artifactSha256: sha256(duplicate) }, duplicate),
    { code: "INVENTORY_MISMATCH" },
  );
  const unknown = Buffer.from(
    JSON.stringify({ verses: [{ ...verses[0], verse: 4 }, ...verses.slice(1)] }),
  );
  assert.throws(() => validateCorpus({ ...manifest, artifactSha256: sha256(unknown) }, unknown), {
    code: "INVENTORY_MISMATCH",
  });
});
test("manifest cannot omit books/chapters, duplicate books, or use unsafe source URLs", () => {
  const { manifest } = corpusFixture();
  assert.equal(
    editionManifestSchema.safeParse({ ...manifest, textFamily: "king-james-version" }).success,
    false,
  );
  assert.equal(
    editionManifestSchema.safeParse({ ...manifest, books: manifest.books.slice(1) }).success,
    false,
  );
  assert.equal(
    editionManifestSchema.safeParse({
      ...manifest,
      books: [manifest.books[1], ...manifest.books.slice(1)],
    }).success,
    false,
  );
  assert.equal(
    editionManifestSchema.safeParse({
      ...manifest,
      books: manifest.books.map((book, i) => (i ? book : { ...book, versesPerChapter: [3] })),
    }).success,
    false,
  );
  assert.equal(
    editionManifestSchema.safeParse({ ...manifest, sourceUrl: "javascript:alert(1)" }).success,
    false,
  );
});
test("invalid UTF-8, malformed JSON, empty and oversized corpora fail before import", () => {
  const { manifest } = corpusFixture();
  for (const bytes of [Buffer.from([0xc0, 0xaf]), Buffer.from("not json")])
    assert.throws(() => validateCorpus({ ...manifest, artifactSha256: sha256(bytes) }, bytes), {
      code: "CORPUS_INVALID",
    });
  assert.throws(() => validateCorpus(manifest, new Uint8Array()), { code: "CORPUS_SIZE" });
  assert.throws(() => validateCorpus(manifest, new Uint8Array(32 * 1024 * 1024 + 1)), {
    code: "CORPUS_SIZE",
  });
});
