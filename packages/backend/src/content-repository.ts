import { randomUUID, createHash } from "node:crypto";
import { practices, categories, type Practice } from "@jesus-in-practice/content";
import { z } from "zod";
import type { Database, SqlExecutor } from "./database.ts";
import { assertOperator } from "./operators.ts";
import { sha256, validateCorpus, inventoryCounts } from "./content-corpus.ts";
import {
  ContentError,
  editionManifestSchema,
  rightsDecisionSchema,
  passageRequestSchema,
  practiceDraftSchema,
  provenanceSchema,
  reviewSchema,
  type EditionManifest,
  type RightsDecision,
  type RightsUse,
  type PassageRequest,
  type TrustedPassage,
  type CorpusVerse,
  type ContentVersion,
  type PublishedPractice,
  type PracticeDraft,
  type DraftProvenance,
  type EditorialReview,
} from "./content-contracts.ts";

interface EditionRow {
  id: string;
  manifest: EditionManifest;
  manifestSha256: string;
  artifactSha256: string;
  rights: Partial<RightsDecision>;
  importedAt: string | null;
}
const editionColumns =
  'id,manifest,manifest_sha256 as "manifestSha256",artifact_sha256 as "artifactSha256",rights,imported_at::text as "importedAt"';
const versionColumns = `v.id,v.practice_id as "practiceId",v.revision,v.edition_id as "editionId",v.passage,v.draft,v.provenance,v.created_by as "createdBy",v.created_at::text as "createdAt",
 (select case e.action when 'review_approve' then 'approve' else 'reject' end from app.content_events e where e.version_id=v.id and e.action in ('review_approve','review_reject') order by e.sequence desc limit 1) as review,
 exists(select 1 from app.content_publications p where p.version_id=v.id and p.active) as published,
 exists(select 1 from app.content_events e where e.version_id=v.id and e.action='withdrawn') as withdrawn`;
const actorSchema = z.uuid();
const practiceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const pageSchema = z.strictObject({
  cursor: z.string().max(300).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
function cursorValue(
  cursor?: string,
  kind: "identifier" | "uuid" | "sequence" = "identifier",
): string | null {
  if (!cursor) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value !== "string" || value.length > 100) throw new Error();
    if (kind === "identifier" && !practiceIdSchema.safeParse(value).success) throw new Error();
    if (kind === "uuid" && !z.uuid().safeParse(value).success) throw new Error();
    if (
      kind === "sequence" &&
      (!/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    )
      throw new Error();
    return value;
  } catch {
    throw new ContentError("INVALID_CURSOR", "The pagination cursor is invalid.");
  }
}
const cursorFor = (value: string) => Buffer.from(JSON.stringify(value)).toString("base64url");
function rightsAllow(edition: EditionRow, use: RightsUse): boolean {
  const r = edition.rights;
  return (
    r.approved === true &&
    r.inventoryVerified === true &&
    (r.territories?.includes("CA") === true || r.territories?.includes("WORLDWIDE") === true) &&
    r.allowedUses?.includes(use) === true &&
    (!r.expiresAt || Date.parse(r.expiresAt) > Date.now())
  );
}
function requireRights(edition: EditionRow, enabled: boolean, uses: RightsUse[]) {
  if (!enabled)
    throw new ContentError("RIGHTS_DISABLED", "The source-rights capability is disabled.");
  if (!uses.every((use) => rightsAllow(edition, use)))
    throw new ContentError(
      "RIGHTS_REQUIRED",
      "This edition does not have current approval for this use.",
    );
}
async function editionRow(sql: SqlExecutor, id: string, lock = false): Promise<EditionRow> {
  const row = (
    await sql.query<EditionRow>(
      `select ${editionColumns} from app.content_editions where id=$1${lock ? " for update" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) throw new ContentError("NOT_FOUND", "Edition not found.");
  return row;
}
async function versionRow(sql: SqlExecutor, id: string): Promise<ContentVersion> {
  const row = (
    await sql.query<ContentVersion>(
      `select ${versionColumns} from app.content_versions v where v.id=$1`,
      [z.uuid().parse(id)],
    )
  ).rows[0];
  if (!row) throw new ContentError("NOT_FOUND", "Content version not found.");
  return row;
}
async function authorize(sql: SqlExecutor, actorId: string) {
  await assertOperator(sql, actorSchema.parse(actorId), ["admin", "editor"]);
}
async function event(
  sql: SqlExecutor,
  editionId: string,
  versionId: string | null,
  action: string,
  detail: unknown,
  actorId: string,
) {
  await sql.query(
    "insert into app.content_events(edition_id,version_id,action,detail,actor_id) values($1,$2,$3,$4,$5)",
    [editionId, versionId, action, JSON.stringify(detail), actorId],
  );
}
async function passageFrom(
  sql: SqlExecutor,
  edition: EditionRow,
  input: PassageRequest,
): Promise<TrustedPassage> {
  const request = passageRequestSchema.parse(input);
  if (!edition.importedAt)
    throw new ContentError(
      "CORPUS_INCOMPLETE",
      "The edition has not completed its validated import.",
    );
  const book = edition.manifest.books.find((book) => book.id === request.book);
  const count = book?.versesPerChapter[request.chapter - 1];
  if (!book || !count || request.toVerse > count)
    throw new ContentError(
      "PASSAGE_INVALID",
      "The passage is outside this edition's verified inventory.",
    );
  const verses = (
    await sql.query<CorpusVerse>(
      "select book,chapter,verse,text from app.content_verses where edition_id=$1 and book=$2 and chapter=$3 and verse between $4 and $5 order by verse",
      [
        edition.id,
        request.book,
        request.chapter,
        Math.max(1, request.fromVerse - request.contextVerses),
        Math.min(count, request.toVerse + request.contextVerses),
      ],
    )
  ).rows;
  const selected = verses.filter(
    (verse) => verse.verse >= request.fromVerse && verse.verse <= request.toVerse,
  );
  if (selected.length !== request.toVerse - request.fromVerse + 1)
    throw new ContentError("CORPUS_INCOMPLETE", "The requested passage is incomplete.");
  if (verses.reduce((total, verse) => total + verse.text.length, 0) > 32000)
    throw new ContentError(
      "PASSAGE_TOO_LARGE",
      "Choose a shorter passage or less surrounding context.",
    );
  return {
    editionId: edition.id,
    editionTitle: edition.manifest.title,
    manifestSha256: edition.manifestSha256,
    corpusSha256: edition.artifactSha256,
    source: edition.manifest.source,
    book: book.id,
    chapter: request.chapter,
    fromVerse: request.fromVerse,
    toVerse: request.toVerse,
    reference: `${book.name} ${request.chapter}:${request.fromVerse}${request.toVerse > request.fromVerse ? `–${request.toVerse}` : ""}`,
    sourceUrl: book.chapterUrlTemplate
      .replaceAll("{chapter}", String(request.chapter))
      .replaceAll("{verse}", String(request.fromVerse)),
    passageKey: `${edition.id}:${book.id}:${request.chapter}:${request.fromVerse}-${request.toVerse}`,
    verses: selected,
    context: verses.filter(
      (verse) => verse.verse < request.fromVerse || verse.verse > request.toVerse,
    ),
  };
}

/** Server-only editorial boundary. Every write checks the current DB operator role. */
export class ContentRepository {
  private readonly database: Database;
  private readonly rightsEnabled: boolean;
  constructor(database: Database, options: { rightsEnabled?: boolean } = {}) {
    this.database = database;
    this.rightsEnabled = options.rightsEnabled === true;
  }
  registerEdition(input: unknown, actorId: string) {
    const manifest = editionManifestSchema.parse(input);
    const manifestHash = sha256(JSON.stringify(manifest));
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      await sql.query(
        "insert into app.content_editions(id,manifest,manifest_sha256,artifact_sha256,created_by) values($1,$2,$3,$4,$5) on conflict(id) do nothing",
        [manifest.id, JSON.stringify(manifest), manifestHash, manifest.artifactSha256, actorId],
      );
      const row = await editionRow(sql, manifest.id);
      if (row.manifestSha256 !== manifestHash)
        throw new ContentError(
          "EDITION_IMMUTABLE",
          "Register a new edition ID for a different manifest.",
        );
      return row;
    });
  }
  setEditionRights(editionId: string, input: unknown, actorId: string) {
    const decision = rightsDecisionSchema.parse(input);
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      await editionRow(sql, editionId, true);
      await sql.query("update app.content_editions set rights=$2 where id=$1", [
        editionId,
        JSON.stringify(decision),
      ]);
      if (!decision.approved)
        await sql.query(
          "update app.content_publications set active=false where version_id in(select id from app.content_versions where edition_id=$1)",
          [editionId],
        );
      await event(sql, editionId, null, "rights", decision, actorId);
      return decision;
    });
  }
  async importCorpus(editionId: string, bytes: Uint8Array, actorId: string) {
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const edition = await editionRow(sql, editionId, true);
      requireRights(edition, this.rightsEnabled, ["store"]);
      const validated = validateCorpus(edition.manifest, bytes);
      if (edition.importedAt)
        return {
          alreadyImported: true,
          ...inventoryCounts(edition.manifest),
          checksum: validated.checksum,
        };
      // A single insert and transaction publish the full corpus together, never an incrementally visible partial import.
      await sql.query(
        "insert into app.content_verses(edition_id,book,chapter,verse,text) select $1,book,chapter,verse,text from jsonb_to_recordset($2::jsonb) as x(book text,chapter integer,verse integer,text text)",
        [editionId, JSON.stringify(validated.verses)],
      );
      await sql.query("update app.content_editions set imported_at=now() where id=$1", [editionId]);
      await event(
        sql,
        editionId,
        null,
        "imported",
        { checksum: validated.checksum, ...inventoryCounts(edition.manifest) },
        actorId,
      );
      return {
        alreadyImported: false,
        ...inventoryCounts(edition.manifest),
        checksum: validated.checksum,
      };
    });
  }
  coverage(editionId: string) {
    return this.database.withService(async (sql) => {
      const edition = await editionRow(sql, editionId);
      const actual = (
        await sql.query<{ books: number; chapters: number; verses: number }>(
          "select count(distinct book)::int as books,count(distinct (book,chapter))::int as chapters,count(*)::int as verses from app.content_verses where edition_id=$1",
          [editionId],
        )
      ).rows[0];
      const versions = (
        await sql.query<{ drafts: number; approved: number }>(
          `select count(*)::int as drafts,count(*) filter(where review='approve')::int as approved from(select ${versionColumns} from app.content_versions v where edition_id=$1) reviewed`,
          [editionId],
        )
      ).rows[0];
      const published =
        this.rightsEnabled && rightsAllow(edition, "display")
          ? (
              await sql.query<{ practices: number; verses: number }>(
                `select count(distinct v.id)::int as practices,count(distinct(v.passage->>'book',v.passage->>'chapter',selected.verse))::int as verses from app.content_publications p join app.content_versions v on v.id=p.version_id cross join lateral generate_series((v.passage->>'fromVerse')::int,(v.passage->>'toVerse')::int) as selected(verse) where p.active and v.edition_id=$1 and not exists(select 1 from app.content_events e where e.version_id=v.id and e.action='withdrawn')`,
                [editionId],
              )
            ).rows[0]
          : { practices: 0, verses: 0 };
      const expected = inventoryCounts(edition.manifest);
      return {
        editionId,
        editionTitle: edition.manifest.title,
        source: edition.manifest.source,
        expected,
        imported: actual,
        complete: !!edition.importedAt && actual.verses === expected.verses,
        rightsEnabled: this.rightsEnabled,
        rightsApproved: rightsAllow(edition, "store"),
        draftVersions: versions.drafts,
        approvedVersions: versions.approved,
        publishedPractices: published.practices,
        publishedPassageVerses: published.verses,
      };
    });
  }
  retrievePassage(input: PassageRequest, options: { forAi?: boolean } = {}) {
    const request = passageRequestSchema.parse(input);
    return this.database.withService(async (sql) => {
      const edition = await editionRow(sql, request.editionId);
      requireRights(edition, this.rightsEnabled, options.forAi ? ["retrieve", "ai"] : ["retrieve"]);
      return passageFrom(sql, edition, request);
    });
  }
  createDraft(
    input: {
      practiceId: string;
      passage: PassageRequest;
      draft: PracticeDraft;
      provenance: DraftProvenance;
    },
    actorId: string,
  ) {
    const practiceId = practiceIdSchema.parse(input.practiceId);
    if (practices.some((practice) => practice.id === practiceId))
      throw new ContentError(
        "PRACTICE_RESERVED",
        "Choose a new practice ID; bundled practice IDs are reserved.",
      );
    const request = passageRequestSchema.parse(input.passage);
    const draft = practiceDraftSchema.parse(input.draft);
    const provenance = provenanceSchema.parse(input.provenance);
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const edition = await editionRow(sql, request.editionId, true);
      requireRights(
        edition,
        this.rightsEnabled,
        provenance.kind === "openai" ? ["retrieve", "display", "ai"] : ["retrieve", "display"],
      );
      const passage = await passageFrom(sql, edition, request);
      await sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `content-practice:${practiceId}`,
      ]);
      const revision = (
        await sql.query<{ revision: number }>(
          "select coalesce(max(revision),0)+1 as revision from app.content_versions where practice_id=$1",
          [practiceId],
        )
      ).rows[0].revision;
      const id = randomUUID();
      await sql.query(
        "insert into app.content_versions(id,practice_id,revision,edition_id,passage,draft,provenance,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          practiceId,
          revision,
          edition.id,
          JSON.stringify(passage),
          JSON.stringify(draft),
          JSON.stringify(provenance),
          actorId,
        ],
      );
      await event(sql, edition.id, id, "draft_created", { revision }, actorId);
      return versionRow(sql, id);
    });
  }
  reviewDraft(versionId: string, input: EditorialReview, actorId: string) {
    const review = reviewSchema.parse(input);
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const initial = await versionRow(sql, versionId);
      const edition = await editionRow(sql, initial.editionId, true);
      const version = await versionRow(sql, versionId);
      if (version.withdrawn || version.published)
        throw new ContentError(
          "VERSION_LOCKED",
          "Create a new revision to review published or withdrawn content.",
        );
      if (review.decision === "approve")
        requireRights(edition, this.rightsEnabled, ["retrieve", "display"]);
      await event(
        sql,
        version.editionId,
        version.id,
        review.decision === "approve" ? "review_approve" : "review_reject",
        review,
        actorId,
      );
      return versionRow(sql, versionId);
    });
  }
  publish(versionId: string, actorId: string) {
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const initial = await versionRow(sql, versionId);
      const edition = await editionRow(sql, initial.editionId, true);
      requireRights(edition, this.rightsEnabled, ["retrieve", "display"]);
      await sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `content-practice:${initial.practiceId}`,
      ]);
      const version = await versionRow(sql, versionId);
      if (version.review !== "approve" || version.withdrawn)
        throw new ContentError(
          "REVIEW_REQUIRED",
          "Only a human-approved, unwithdrawn version can be published.",
        );
      await sql.query(
        "insert into app.content_publications(practice_id,version_id) values($1,$2) on conflict(practice_id) do update set version_id=excluded.version_id,published_at=now(),active=true",
        [version.practiceId, version.id],
      );
      await event(sql, version.editionId, version.id, "published", {}, actorId);
      return versionRow(sql, versionId);
    });
  }
  withdraw(versionId: string, reason: string, actorId: string) {
    const explanation = z.string().trim().min(10).max(2000).parse(reason);
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const initial = await versionRow(sql, versionId);
      await editionRow(sql, initial.editionId, true);
      const version = await versionRow(sql, versionId);
      await sql.query("update app.content_publications set active=false where version_id=$1", [
        versionId,
      ]);
      if (!version.withdrawn)
        await event(
          sql,
          version.editionId,
          versionId,
          "withdrawn",
          { reason: explanation },
          actorId,
        );
      return versionRow(sql, versionId);
    });
  }
  getVersion(versionId: string, actorId: string) {
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      return versionRow(sql, versionId);
    });
  }
  listEditions(actorId: string, options: { cursor?: string; limit?: number } = {}) {
    const { cursor, limit } = pageSchema.parse(options);
    const after = cursorValue(cursor);
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const rows = (
        await sql.query<EditionRow>(
          `select ${editionColumns} from app.content_editions where ($1::text is null or id collate "C">$1) order by id collate "C" limit $2`,
          [after, limit + 1],
        )
      ).rows;
      const total = (
        await sql.query<{ total: number }>(
          "select count(*)::int as total from app.content_editions",
        )
      ).rows[0].total;
      return {
        items: rows.slice(0, limit).map((edition) => ({
          ...edition,
          eligibleForDraft:
            this.rightsEnabled &&
            !!edition.importedAt &&
            rightsAllow(edition, "retrieve") &&
            rightsAllow(edition, "display"),
          eligibleForAi:
            this.rightsEnabled &&
            !!edition.importedAt &&
            rightsAllow(edition, "retrieve") &&
            rightsAllow(edition, "display") &&
            rightsAllow(edition, "ai"),
        })),
        nextCursor: rows.length > limit ? cursorFor(rows[limit - 1].id) : null,
        total,
      };
    });
  }
  listDrafts(
    actorId: string,
    options: { cursor?: string; limit?: number; editionId?: string } = {},
  ) {
    const { cursor, limit } = pageSchema.parse({ cursor: options.cursor, limit: options.limit });
    const before = cursorValue(cursor, "uuid");
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      const rows = (
        await sql.query<ContentVersion>(
          `select ${versionColumns} from app.content_versions v where ($1::text is null or v.edition_id=$1) and ($2::uuid is null or v.id<$2) order by v.id desc limit $3`,
          [options.editionId ?? null, before, limit + 1],
        )
      ).rows;
      const total = (
        await sql.query<{ total: number }>(
          "select count(*)::int as total from app.content_versions where ($1::text is null or edition_id=$1)",
          [options.editionId ?? null],
        )
      ).rows[0].total;
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? cursorFor(rows[limit - 1].id) : null,
        total,
      };
    });
  }
  listReviews(
    versionId: string,
    actorId: string,
    options: { cursor?: string; limit?: number } = {},
  ) {
    const { cursor, limit } = pageSchema.parse(options);
    const before = cursorValue(cursor, "sequence");
    return this.database.withService(async (sql) => {
      await authorize(sql, actorId);
      await versionRow(sql, versionId);
      const rows = (
        await sql.query<{
          sequence: string;
          action: string;
          detail: EditorialReview;
          actorId: string;
          createdAt: string;
        }>(
          `select sequence::text,action,detail,actor_id as "actorId",created_at::text as "createdAt" from app.content_events where version_id=$1 and action in ('review_approve','review_reject') and ($2::bigint is null or sequence<$2) order by sequence desc limit $3`,
          [versionId, before, limit + 1],
        )
      ).rows;
      const total = (
        await sql.query<{ total: number }>(
          "select count(*)::int as total from app.content_events where version_id=$1 and action in ('review_approve','review_reject')",
          [versionId],
        )
      ).rows[0].total;
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? cursorFor(rows[limit - 1].sequence) : null,
        total,
      };
    });
  }
  listPublished(
    options: {
      source?: "bible" | "book-of-mormon" | "both";
      topics?: string[];
      cursor?: string;
      limit?: number;
      use?: "display" | "email" | "sms";
      search?: string;
      ids?: string[];
    } = {},
  ) {
    const { cursor, limit } = pageSchema.parse({ cursor: options.cursor, limit: options.limit });
    const after = cursorValue(cursor);
    const use = z.enum(["display", "email", "sms"]).parse(options.use ?? "display");
    if (!this.rightsEnabled)
      return Promise.resolve({ items: [] as PublishedPractice[], nextCursor: null, total: 0 });
    return this.database.withService(async (sql) => {
      const filter = `p.active and e.imported_at is not null and e.rights->>'approved'='true' and e.rights->>'inventoryVerified'='true' and (e.rights->'territories' ? 'CA' or e.rights->'territories' ? 'WORLDWIDE') and e.rights->'allowedUses' ? $1 and e.rights->'allowedUses' ? 'display' and (e.rights->>'expiresAt' is null or (e.rights->>'expiresAt')::timestamptz>now()) and ($2::text is null or v.passage->>'source'=$2) and ($3::text[] is null or v.draft->>'category'=any($3)) and not exists(select 1 from app.content_events ce where ce.version_id=v.id and ce.action='withdrawn')`;
      const restrictedFilter = `${filter} and ($4::text is null or concat_ws(' ',v.draft->>'title',v.draft->>'summary',v.passage->>'reference',v.draft->>'category',v.draft->>'plainMeaning',v.draft->>'everydayExample',v.draft->>'action') ilike $4) and ($5::text[] is null or v.practice_id=any($5))`;
      const values = [
        use,
        options.source && options.source !== "both" ? options.source : null,
        options.topics?.length ? options.topics : null,
        options.search?.trim()
          ? `%${z
              .string()
              .max(200)
              .parse(options.search)
              .trim()
              .replace(/[\\%_]/g, "\\$&")}%`
          : null,
        options.ids ?? null,
      ];
      const rows = (
        await sql.query<ContentVersion & { publishedAt: string }>(
          `select ${versionColumns},p.published_at::text as "publishedAt" from app.content_publications p join app.content_versions v on v.id=p.version_id join app.content_editions e on e.id=v.edition_id where ${restrictedFilter} and ($6::text is null or p.practice_id collate "C">$6) order by p.practice_id collate "C" limit $7`,
          [...values, after, limit + 1],
        )
      ).rows;
      const total = (
        await sql.query<{ total: number }>(
          `select count(*)::int as total from app.content_publications p join app.content_versions v on v.id=p.version_id join app.content_editions e on e.id=v.edition_id where ${restrictedFilter}`,
          values,
        )
      ).rows[0].total;
      return {
        items: rows.slice(0, limit).map(publishedPractice),
        nextCursor: rows.length > limit ? cursorFor(rows[limit - 1].practiceId) : null,
        total,
      };
    });
  }
  async getPublished(practiceId: string, use: "display" | "email" | "sms" = "display") {
    return this.findPublished(practiceId, undefined, use);
  }
  async selectForDelivery(
    preferences: { source: "bible" | "book-of-mormon" | "both"; topics: readonly string[] },
    occurrenceKey: string,
    channel: "email" | "sms",
  ): Promise<Practice | PublishedPractice | undefined> {
    const source = z.enum(["bible", "book-of-mormon", "both"]).parse(preferences.source);
    const topics = z.array(z.enum(categories)).max(categories.length).parse(preferences.topics);
    const key = z.string().min(1).max(500).parse(occurrenceKey);
    const deliveryChannel = z.enum(["email", "sms"]).parse(channel);
    // MD5 is only a deterministic ordering function here, never a credential/signature or integrity hash.
    const rank = (id: string) => createHash("md5").update(`${key}:${id}`).digest("hex");
    const bundled = practices
      .filter(
        (item) =>
          (source === "both" || item.source === source) &&
          (!topics.length || topics.includes(item.category)),
      )
      .map((item) => ({ practice: item, rank: rank(item.id) }))
      .sort((a, b) =>
        a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.practice.id < b.practice.id ? -1 : 1,
      )[0];
    if (!this.rightsEnabled) return bundled?.practice;
    const published = await this.database.withService(
      async (sql) =>
        (
          await sql.query<ContentVersion & { publishedAt: string; rank: string }>(
            `select ${versionColumns},p.published_at::text as "publishedAt",md5($1||':'||p.practice_id) as rank from app.content_publications p join app.content_versions v on v.id=p.version_id where app.content_version_available(v.id,$4) and ($2::text is null or v.passage->>'source'=$2) and ($3::text[] is null or v.draft->>'category'=any($3)) order by md5($1||':'||p.practice_id) collate "C",p.practice_id collate "C" limit 1`,
            [
              key,
              source === "both" ? null : source,
              topics.length ? topics : null,
              deliveryChannel,
            ],
          )
        ).rows[0],
    );
    if (!published) return bundled?.practice;
    if (
      !bundled ||
      published.rank < bundled.rank ||
      (published.rank === bundled.rank && published.practiceId < bundled.practice.id)
    )
      return publishedPractice(published);
    return bundled.practice;
  }
  async getPublishedVersion(versionId: string, use: "display" | "email" | "sms" = "display") {
    return this.findPublished(undefined, z.uuid().parse(versionId), use);
  }
  private async findPublished(
    practiceId: string | undefined,
    versionId: string | undefined,
    use: "display" | "email" | "sms",
  ) {
    if (!this.rightsEnabled) return null;
    return this.database.withService(async (sql) => {
      const row = (
        await sql.query<ContentVersion & { publishedAt: string }>(
          `select ${versionColumns},p.published_at::text as "publishedAt" from app.content_publications p join app.content_versions v on v.id=p.version_id where p.active and ($1::text is null or p.practice_id=$1) and ($2::uuid is null or v.id=$2)`,
          [practiceId ?? null, versionId ?? null],
        )
      ).rows[0];
      if (!row || row.withdrawn || row.review !== "approve") return null;
      const edition = await editionRow(sql, row.editionId);
      return edition.importedAt && rightsAllow(edition, "display") && rightsAllow(edition, use)
        ? publishedPractice(row)
        : null;
    });
  }
}
function publishedPractice(version: ContentVersion & { publishedAt: string }): PublishedPractice {
  return {
    ...version.draft,
    id: version.practiceId,
    source: version.passage.source,
    reference: version.passage.reference,
    sourceUrl: version.passage.sourceUrl,
    smsText: `${version.passage.source === "bible" ? "Bible (KJV)" : "Book of Mormon"} · ${version.passage.reference}: ${version.draft.smsText}`,
    versionId: version.id,
    revision: version.revision,
    editionId: version.editionId,
    editionTitle: version.passage.editionTitle,
    corpusSha256: version.passage.corpusSha256,
    passageKey: version.passage.passageKey,
    publishedAt: version.publishedAt,
  };
}
