import { categories, type Practice } from "@jesus-in-practice/content";
import { z } from "zod";

export class ContentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ContentError";
    this.code = code;
  }
}
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(value),
      "Use plain text.",
    );
export const secureSourceUrl = z
  .string()
  .max(1500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/[\u0000-\u0020<>]/.test(value)
      );
    } catch {
      return false;
    }
  });

/** Supported chapter numbering, not a verse-text licence or proof of inventory accuracy. */
export const canonicalChapters = {
  bible: {
    genesis: 50,
    exodus: 40,
    leviticus: 27,
    numbers: 36,
    deuteronomy: 34,
    joshua: 24,
    judges: 21,
    ruth: 4,
    "1-samuel": 31,
    "2-samuel": 24,
    "1-kings": 22,
    "2-kings": 25,
    "1-chronicles": 29,
    "2-chronicles": 36,
    ezra: 10,
    nehemiah: 13,
    esther: 10,
    job: 42,
    psalms: 150,
    proverbs: 31,
    ecclesiastes: 12,
    "song-of-solomon": 8,
    isaiah: 66,
    jeremiah: 52,
    lamentations: 5,
    ezekiel: 48,
    daniel: 12,
    hosea: 14,
    joel: 3,
    amos: 9,
    obadiah: 1,
    jonah: 4,
    micah: 7,
    nahum: 3,
    habakkuk: 3,
    zephaniah: 3,
    haggai: 2,
    zechariah: 14,
    malachi: 4,
    matthew: 28,
    mark: 16,
    luke: 24,
    john: 21,
    acts: 28,
    romans: 16,
    "1-corinthians": 16,
    "2-corinthians": 13,
    galatians: 6,
    ephesians: 6,
    philippians: 4,
    colossians: 4,
    "1-thessalonians": 5,
    "2-thessalonians": 3,
    "1-timothy": 6,
    "2-timothy": 4,
    titus: 3,
    philemon: 1,
    hebrews: 13,
    james: 5,
    "1-peter": 5,
    "2-peter": 3,
    "1-john": 5,
    "2-john": 1,
    "3-john": 1,
    jude: 1,
    revelation: 22,
  },
  "book-of-mormon": {
    "1-nephi": 22,
    "2-nephi": 33,
    jacob: 7,
    enos: 1,
    jarom: 1,
    omni: 1,
    "words-of-mormon": 1,
    mosiah: 29,
    alma: 63,
    helaman: 16,
    "3-nephi": 30,
    "4-nephi": 1,
    mormon: 9,
    ether: 15,
    moroni: 10,
  },
} as const;
export const editionManifestSchema = z
  .strictObject({
    id: identifier,
    source: z.enum(["bible", "book-of-mormon"]),
    textFamily: z.enum(["king-james-version", "book-of-mormon"]),
    title: plain(160),
    language: z.literal("en"),
    sourceUrl: secureSourceUrl,
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    inventoryEvidence: plain(2000),
    normalizationNotes: plain(2000),
    books: z
      .array(
        z.strictObject({
          id: identifier,
          name: plain(80),
          chapterUrlTemplate: secureSourceUrl,
          /** Index zero is chapter 1; the value is the independently verified expected verse count. */
          versesPerChapter: z.array(z.number().int().min(1).max(300)).min(1).max(150),
        }),
      )
      .min(15)
      .max(66),
  })
  .superRefine((value, context) => {
    if (value.textFamily !== (value.source === "bible" ? "king-james-version" : "book-of-mormon"))
      context.addIssue({
        code: "custom",
        message: "Select the exact supported text family for this scripture source.",
      });
    const expected: Record<string, number> = canonicalChapters[value.source];
    const ids = value.books.map((book) => book.id);
    if (
      ids.length !== Object.keys(expected).length ||
      new Set(ids).size !== ids.length ||
      value.books.some((book) => expected[book.id] !== book.versesPerChapter.length)
    )
      context.addIssue({
        code: "custom",
        message:
          "Supply every supported book and chapter exactly once, with its independently verified verse inventory.",
      });
  });
export type EditionManifest = z.infer<typeof editionManifestSchema>;
export const rightsUses = ["store", "retrieve", "ai", "display", "email", "sms"] as const;
export type RightsUse = (typeof rightsUses)[number];
export const rightsDecisionSchema = z
  .strictObject({
    approved: z.boolean(),
    evidence: plain(4000),
    territories: z
      .array(z.string().regex(/^(?:[A-Z]{2}|WORLDWIDE)$/))
      .min(1)
      .max(30),
    allowedUses: z
      .array(z.enum(rightsUses))
      .max(6)
      .refine((items) => new Set(items).size === items.length),
    inventoryVerified: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .refine(
    (value) => !value.approved || (value.inventoryVerified && value.allowedUses.includes("store")),
    "Approval requires reviewed inventory and storage permission.",
  );
export type RightsDecision = z.infer<typeof rightsDecisionSchema>;
export const verseSchema = z.strictObject({
  book: identifier,
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
  text: z
    .string()
    .min(1)
    .max(6000)
    .refine(
      (value) =>
        value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(value),
      "Use nonempty plain source text.",
    ),
});
export type CorpusVerse = z.infer<typeof verseSchema>;
export const passageRequestSchema = z
  .strictObject({
    editionId: identifier,
    book: identifier,
    chapter: z.number().int().positive(),
    fromVerse: z.number().int().positive(),
    toVerse: z.number().int().positive(),
    contextVerses: z.number().int().min(0).max(5).default(3),
  })
  .refine(
    (value) => value.toVerse >= value.fromVerse && value.toVerse - value.fromVerse < 20,
    "Select one to twenty contiguous verses within a chapter.",
  );
export type PassageRequest = z.input<typeof passageRequestSchema>;
export interface TrustedPassage {
  editionId: string;
  editionTitle: string;
  manifestSha256: string;
  corpusSha256: string;
  source: "bible" | "book-of-mormon";
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number;
  reference: string;
  sourceUrl: string;
  passageKey: string;
  verses: CorpusVerse[];
  context: CorpusVerse[];
}
export const practiceDraftSchema = z.strictObject({
  title: plain(100),
  summary: plain(700),
  plainMeaning: plain(500),
  everydayExample: plain(600),
  action: plain(500),
  reflection: plain(350),
  smsText: plain(600),
  category: z.enum(categories),
  minutes: z.number().int().min(1).max(60),
});
export type PracticeDraft = z.infer<typeof practiceDraftSchema>;
export const provenanceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("manual"), notes: plain(1000) }),
  z.strictObject({
    kind: z.literal("openai"),
    model: plain(100),
    promptVersion: plain(100),
    requestId: plain(200),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.iso.datetime(),
  }),
]);
export type DraftProvenance = z.infer<typeof provenanceSchema>;
export const reviewSchema = z
  .strictObject({
    decision: z.enum(["approve", "reject"]),
    reason: plain(2000),
    checks: z.strictObject({
      reference: z.boolean(),
      context: z.boolean(),
      meaning: z.boolean(),
      safety: z.boolean(),
      rights: z.boolean(),
      originalExplanation: z.boolean(),
    }),
  })
  .refine(
    (value) => value.decision !== "approve" || Object.values(value.checks).every(Boolean),
    "Every editorial check is required for approval.",
  );
export type EditorialReview = z.infer<typeof reviewSchema>;
export interface ContentVersion {
  id: string;
  practiceId: string;
  revision: number;
  editionId: string;
  passage: TrustedPassage;
  draft: PracticeDraft;
  provenance: DraftProvenance;
  createdBy: string;
  createdAt: string;
  review: "approve" | "reject" | null;
  published: boolean;
  withdrawn: boolean;
}
export interface PublishedPractice extends Practice {
  versionId: string;
  revision: number;
  editionId: string;
  editionTitle: string;
  corpusSha256: string;
  passageKey: string;
  publishedAt: string;
}
