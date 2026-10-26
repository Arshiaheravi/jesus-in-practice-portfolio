import { categories, practices, type Practice } from "@jesus-in-practice/content";
import { z } from "zod";
import { ContentError } from "./content-contracts.ts";
import type { ContentRepository } from "./content-repository.ts";

export const catalogQuerySchema = z.strictObject({
  source: z.enum(["bible", "book-of-mormon", "both"]).default("both"),
  topics: z.array(z.enum(categories)).max(12).default([]),
  q: z.string().trim().max(200).default(""),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type CatalogQuery = z.input<typeof catalogQuerySchema>;
export interface CatalogPage {
  items: Practice[];
  nextCursor: string | null;
  total: number;
  updatedAt: string;
}
/** One lexicographic cursor spans bundled and imported records; bundled IDs cannot be overwritten. */
export async function readCatalog(
  repo: ContentRepository,
  input: CatalogQuery,
  savedIds?: string[],
): Promise<CatalogPage> {
  const query = catalogQuerySchema.parse(input);
  let after: string | null = null;
  if (query.cursor) {
    try {
      const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
      if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) throw new Error();
      after = value;
    } catch {
      throw new ContentError("INVALID_CURSOR", "The practice cursor is invalid.");
    }
  }
  const bundled = practices.filter(
    (practice) =>
      (query.source === "both" || query.source === practice.source) &&
      (!query.topics.length || query.topics.includes(practice.category)) &&
      (!savedIds || savedIds.includes(practice.id)) &&
      `${practice.title} ${practice.summary} ${practice.reference} ${practice.category} ${practice.plainMeaning} ${practice.everydayExample} ${practice.action}`
        .toLowerCase()
        .includes(query.q.toLowerCase()),
  );
  const published = await repo.listPublished({
    source: query.source,
    topics: query.topics,
    search: query.q,
    cursor: query.cursor,
    limit: query.limit,
    ids: savedIds,
  });
  const combined = [
    ...bundled
      .filter((item) => !after || item.id > after)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, query.limit + 1),
    ...published.items,
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
  const items = combined.slice(0, query.limit);
  return {
    items,
    nextCursor:
      items.length && (combined.length > query.limit || published.nextCursor)
        ? Buffer.from(JSON.stringify(items[items.length - 1].id)).toString("base64url")
        : null,
    total: bundled.length + published.total,
    updatedAt: new Date().toISOString(),
  };
}
