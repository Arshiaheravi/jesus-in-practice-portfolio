import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpusFixture, approvedRights } from "./content-fixtures.mjs";
import { runContentCommand, readBoundedFile } from "../scripts/content.mjs";
test("content CLI validates locally and cannot mutate without an explicit apply flag", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jip-content-test-"));
  try {
    const source = corpusFixture();
    const manifest = join(directory, "manifest.json");
    const corpus = join(directory, "corpus.json");
    const rights = join(directory, "rights.json");
    await writeFile(manifest, JSON.stringify(source.manifest));
    await writeFile(corpus, source.bytes);
    await writeFile(rights, JSON.stringify(approvedRights));
    const validated = await runContentCommand(
      ["validate", "--manifest", manifest, "--file", corpus],
      {},
    );
    assert.equal(validated.validated, true);
    assert.equal(validated.verses, 717);
    for (const args of [
      ["register", "--file", manifest],
      ["rights", "--edition", "synthetic-bom", "--file", rights],
      ["import", "--manifest", manifest, "--file", corpus],
    ])
      assert.equal((await runContentCommand(args, {})).dryRun, true);
    await assert.rejects(
      runContentCommand(
        [
          "register",
          "--file",
          manifest,
          "--apply",
          "--actor",
          "00000000-0000-4000-8000-000000000001",
        ],
        {},
      ),
      { code: "DATABASE_REQUIRED" },
    );
    await assert.rejects(readBoundedFile(corpus, 20), { code: "FILE_SIZE" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
