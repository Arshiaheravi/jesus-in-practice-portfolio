import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ContentError,
  editionManifestSchema,
  verseSchema,
  type CorpusVerse,
  type EditionManifest,
} from "./content-contracts.ts";

export const MAX_CORPUS_BYTES = 32 * 1024 * 1024;
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function inventoryCounts(manifest: EditionManifest) {
  return {
    books: manifest.books.length,
    chapters: manifest.books.reduce((sum, book) => sum + book.versesPerChapter.length, 0),
    verses: manifest.books.reduce(
      (sum, book) => sum + book.versesPerChapter.reduce((a, b) => a + b, 0),
      0,
    ),
  };
}
/** Validate against an independently reviewed manifest, never inventory inferred from the uploaded text. */
export function validateCorpus(
  manifestInput: unknown,
  bytes: Uint8Array,
): { manifest: EditionManifest; verses: CorpusVerse[]; checksum: string } {
  const manifest = editionManifestSchema.parse(manifestInput);
  if (!bytes.byteLength || bytes.byteLength > MAX_CORPUS_BYTES)
    throw new ContentError("CORPUS_SIZE", "The corpus must be between 1 byte and 32 MiB.");
  const checksum = sha256(bytes);
  if (checksum !== manifest.artifactSha256)
    throw new ContentError(
      "CHECKSUM_MISMATCH",
      "The corpus does not match the approved artifact checksum.",
    );
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ContentError("CORPUS_INVALID", "The corpus must be valid UTF-8 JSON.");
  }
  const parsed = z.strictObject({ verses: z.array(verseSchema).max(100000) }).safeParse(raw);
  if (!parsed.success)
    throw new ContentError("CORPUS_INVALID", "Corpus verse records are invalid.");
  const expected = inventoryCounts(manifest).verses;
  const seen = new Set<string>();
  const books = new Map(manifest.books.map((book) => [book.id, book]));
  for (const verse of parsed.data.verses) {
    const book = books.get(verse.book);
    const maximum = book?.versesPerChapter[verse.chapter - 1];
    const key = `${verse.book}:${verse.chapter}:${verse.verse}`;
    if (!maximum || verse.verse > maximum || seen.has(key))
      throw new ContentError(
        "INVENTORY_MISMATCH",
        "The corpus contains unknown, duplicated, or out-of-range verses.",
      );
    seen.add(key);
  }
  if (seen.size !== expected)
    throw new ContentError(
      "INVENTORY_INCOMPLETE",
      `The corpus has ${seen.size} validated verses; the approved inventory requires ${expected}. No partial import was stored.`,
    );
  return { manifest, verses: parsed.data.verses, checksum };
}
