import { canonicalChapters, rightsUses } from "../src/content-contracts.ts";
import { sha256 } from "../src/content-corpus.ts";
/** Deliberately synthetic text/inventory; this is NOT a real scripture edition or rights approval. */
export function corpusFixture(id = "synthetic-bom") {
  const books = Object.entries(canonicalChapters["book-of-mormon"]).map(([book, chapters]) => ({
    id: book,
    name: book,
    chapterUrlTemplate: `https://example.test/${book}/{chapter}#${"{verse}"}`,
    versesPerChapter: Array.from({ length: chapters }, () => 3),
  }));
  const verses = books.flatMap((book) =>
    book.versesPerChapter.flatMap((count, index) =>
      Array.from({ length: count }, (_, v) => ({
        book: book.id,
        chapter: index + 1,
        verse: v + 1,
        text: `Synthetic test text ${book.id} chapter ${index + 1} verse ${v + 1}.`,
      })),
    ),
  );
  const bytes = Buffer.from(JSON.stringify({ verses }));
  const manifest = {
    id,
    source: "book-of-mormon",
    textFamily: "book-of-mormon",
    title: "Synthetic test edition — not scripture",
    language: "en",
    sourceUrl: "https://example.test/edition",
    artifactSha256: sha256(bytes),
    inventoryEvidence:
      "Synthetic test inventory with three records per chapter; never deploy as scripture.",
    normalizationNotes: "Generated isolated test data with no real scripture text.",
    books,
  };
  return { manifest, bytes, verses };
}
export const approvedRights = {
  approved: true,
  evidence: "Synthetic test permission only, not real edition approval.",
  territories: ["CA"],
  allowedUses: [...rightsUses],
  inventoryVerified: true,
  expiresAt: null,
};
export const draftFixture = {
  title: "Offer practical help",
  summary: "An original explanation for a synthetic fixture.",
  plainMeaning: "Notice another person's needs.",
  everydayExample: "For example, a neighbour could need help carrying groceries.",
  action: "Ask if help carrying one bag would be useful.",
  reflection: "What useful support could you offer?",
  smsText: "Notice a neighbour's need. Ask whether carrying one grocery bag would help.",
  category: "Service",
  minutes: 5,
};
export const passageFixture = {
  editionId: "synthetic-bom",
  book: "mosiah",
  chapter: 2,
  fromVerse: 2,
  toVerse: 2,
};
export const manualProvenance = { kind: "manual", notes: "Original test draft." };
export const approval = {
  decision: "approve",
  reason: "Synthetic test content reviewed against synthetic fixture.",
  checks: {
    reference: true,
    context: true,
    meaning: true,
    safety: true,
    rights: true,
    originalExplanation: true,
  },
};
