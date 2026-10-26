# Scripture corpus and editorial pipeline

The backend implements a gated corpus importer and human-reviewed publishing workflow. It does **not** ship a full scripture corpus, an approved source licence, generated lessons, or a verified live AI connection. The existing 24 bundled practices remain their own collection. Test text is synthetic and must never be imported as scripture.

## Boundaries and configuration

`packages/backend/src/content-contracts.ts`, `content-corpus.ts`, `content-repository.ts`, and `content-ai.ts` contain the domain boundary. Migration `202610170006_content_editorial.sql` adds private `app` tables; members and anonymous clients cannot query them directly. Every repository mutation and editorial-list read checks the current database operator role: `admin` or `editor`. A `support` role does not grant editorial access. API authentication and rate limits remain the server route's responsibility; never accept an actor ID supplied by a browser as identity.

| Setting                                     | Default / meaning                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTENT_RIGHTS_ENABLED`                    | Off. The server must pass `rightsEnabled: true` to `ContentRepository` only when explicitly configured. The CLI reads this exact environment flag.                                      |
| `ENABLE_AI_DRAFTING`                        | Off. `contentAiConfigFromEnv` enables the adapter only for the exact value `true`.                                                                                                      |
| `OPENAI_API_KEY`                            | Server secret; never a public environment variable, command-line argument, or browser field.                                                                                            |
| `OPENAI_CONTENT_MODEL`                      | Required explicit model ID. No guessed default or automatic model migration. Verify structured-output support, account availability, current price, and provider terms before enabling. |
| `DATABASE_URL`, optional `DATABASE_CA_CERT` | Secure process environment. Remote PostgreSQL connections verify TLS; connection-string SSL overrides are removed.                                                                      |

The source gate controls the imported collection, not the separate original bundled practices. Turning it off returns an empty imported publishing pool. Rights approval is per edition and per use: `store`, `retrieve`, `ai`, `display`, `email`, `sms`. Approval requires independently reviewed inventory and a recorded evidence statement. Current Canadian operation requires territory `CA` or `WORLDWIDE`; other entries use uppercase two-letter country codes. Expired approval cannot authorize use. This is a technical gate, not a legal determination or geographic enforcement system. Review actual territories of access and distribution before launch.

## Choose and document an edition

An operator must obtain an authorized artifact and independently establish the exact edition, permitted uses, Canadian and other relevant territorial rights, attribution, restrictions, expiry, and any rights in notes or formatting. Put the substantive permission evidence in the rights decision; retain supporting agreements securely. Do not infer permission from the existence of a website or a download button.

Research candidates, **not approved sources**:

- [eBible's English KJV record](https://ebible.org/find/details.php?id=engkjv) describes a standardized 1769 KJV with Strong's numbers, supplies several machine-readable formats, and makes a public-domain claim with a UK exception. Review the actual artifact, annotations, normalization, and applicable territories before choosing it.
- [Project Gutenberg's KJV record](https://www.gutenberg.org/ebooks/10) and [Book of Mormon record](https://www.gutenberg.org/ebooks/17) label their copyright status in the USA. That statement does not itself establish Canadian or worldwide permission. Confirm the precise edition and numbering from the artifact, not an automatically generated catalogue synopsis.
- [Project Gutenberg's permission guidance](https://www.gutenberg.org/policy/permission.html) addresses use outside the USA and its separate name/trademark terms. Review those conditions before commercial reuse or redistribution.

No church website is scraped by this importer. It accepts a local normalized file; source URLs are citations and are never fetched. If an authorized historical Book of Mormon artifact uses different chapter or verse numbering, document and independently verify an authorized mapping, or implement a separately reviewed numbering scheme first. Do not silently label one edition as another. The supported Bible family is the KJV with the 66-book Protestant inventory; Apocrypha, other translations, Doctrine and Covenants, and other languages are outside this implementation.

## Manifest and complete import

The manifest is strict JSON with these fields:

```text
id: lowercase stable slug, maximum 80 characters
source: bible | book-of-mormon
textFamily: king-james-version | book-of-mormon (must agree with source)
title: exact edition name
language: en
sourceUrl: reviewed HTTPS provenance URL
artifactSha256: SHA-256 of the exact normalized UTF-8 JSON bytes
inventoryEvidence: how expected verse counts were independently established
normalizationNotes: source-to-normalized-text decisions, omissions and annotations
books: every supported book, each with
  id, name, chapterUrlTemplate, versesPerChapter
```

`canonicalChapters` in `content-contracts.ts` lists supported book IDs and chapter counts. There must be all 66 Bible books or all 15 Book of Mormon books, each exactly once. `versesPerChapter[0]` is the independently verified expected count for chapter 1. It is **not inferred from the upload**. Each expected count is positive and at most 300. Do not use the synthetic test manifest as an inventory template without replacing and independently checking every count.

`chapterUrlTemplate` is a reviewed HTTPS citation, optionally containing `{chapter}` and `{verse}`. If a source supports only a book or edition landing page, use that honest URL; a template does not prove that an external deep link works. URLs cannot contain credentials or active URL schemes.

The corpus is at most 32 MiB and contains only:

```json
{
  "verses": [{ "book": "james", "chapter": 1, "verse": 1, "text": "AUTHORIZED VERSE TEXT" }]
}
```

This illustration is intentionally incomplete and will fail import. Supply every expected verse exactly once, with positive numeric chapter/verse identifiers and plain text of at most 6,000 characters per verse. The importer rejects checksum differences, malformed UTF-8/JSON, unknown books, missing chapters or verses, duplicate verses, and out-of-range records. It stores nothing on validation failure. The complete insert, completion timestamp, and audit event commit atomically. Reimporting the same completed artifact is idempotent. A different artifact or manifest needs a new edition ID; edition evidence and imported verses cannot be overwritten.

“Complete” means complete **against that independently approved inventory**, not an automated proof of textual authenticity, licence validity, or interpretive completeness. The database statement timeout also applies to import; a timeout rolls back. Rehearse a full authorized artifact on a separate test database before the first production import.

## Operator CLI

Run from the repository root with the pinned pnpm/Node toolchain. On Windows, replace `pnpm` with `npx.cmd --yes pnpm@10.26.0` if needed. Supply secrets through a protected process environment or an ignored local environment file; none are accepted as CLI flags. Review the target database and backups before applying mutations.

```powershell
pnpm exec node --experimental-strip-types packages/backend/scripts/content.mjs validate --manifest C:/secure/edition.json --file C:/secure/corpus.json
pnpm exec node --experimental-strip-types packages/backend/scripts/content.mjs register --file C:/secure/edition.json
pnpm exec node --experimental-strip-types packages/backend/scripts/content.mjs rights --edition approved-edition-id --file C:/secure/rights.json
pnpm exec node --experimental-strip-types packages/backend/scripts/content.mjs import --manifest C:/secure/edition.json --file C:/secure/corpus.json
```

These commands validate local input only and do not connect to a database. For `register`, `rights`, or `import`, add `--apply --actor VERIFIED_OPERATOR_UUID` after reviewing the result. The UUID identifies the already provisioned operator; possessing a UUID does not confer database access. The repository checks its current active role. Import additionally needs `CONTENT_RIGHTS_ENABLED=true` and an approved stored rights decision. The local manifest used for import dry-run validation cannot override the registered server manifest.

```json
{
  "approved": false,
  "evidence": "Pending exact edition, licence, territory and permitted-use review.",
  "territories": ["CA"],
  "allowedUses": [],
  "inventoryVerified": false,
  "expiresAt": null
}
```

This is a pending decision, not permission. An actual approval must include evidence, `inventoryVerified: true`, and at least `store`; enable each additional use only when supported. Read current coverage with `coverage --edition approved-edition-id --actor VERIFIED_OPERATOR_UUID`; it requires a database connection and current operator access, but makes no change. The CLI never prints corpus text, credentials, or raw database errors.

## Grounded drafting and human publication

1. Retrieve a known range through `retrievePassage(request, { forAi: true })`. A request contains `editionId`, `book`, `chapter`, `fromVerse`, `toVerse`, and optional `contextVerses` (default 3, maximum 5 each side). It accepts 1–20 contiguous verses within one chapter. The repository constructs the reference, URL, source, edition/checksums, and passage key. It returns selected verses and neighbouring context separately, capped at 32,000 text characters. An AI request additionally needs the edition's `ai` permission.
2. `ContentDrafter.draft(trustedPassage, optionalCategory)` makes one request to the fixed official OpenAI Responses endpoint using strict JSON-schema output. It sends only the source material, edition/reference and optional editorial category—not recipient addresses, phone numbers, account IDs, private reflections, or inferred vulnerabilities. No tool access, URL retrieval or model-memory reference lookup is enabled. Input is at most 60,000 UTF-8 bytes; output tokens are capped at 3,000 (default 2,200), response body at 128,000 bytes, and timeout at 30 seconds (default 20). It sets `store: false`; this does not by itself establish zero retention or satisfy all provider data obligations. Review applicable provider terms separately.
3. The adapter validates fields and limits, rejects changed passage keys, incomplete/refused/oversized output, and allows an honest `insufficient_context` result. Reference and collection are server supplied; model output cannot choose a different citation. There is no paid automatic retry. A timeout can still have incurred provider work; review provider usage before deliberate retry. Model, prompt version, request ID, input hash, and generation time are retained as provenance on a saved draft.
4. `createDraft({ practiceId, passage, draft, provenance }, actorId)` resolves the passage again from the stored corpus. Here `passage` is a **PassageRequest**, not client-submitted scripture text. Manual drafts use `{ kind: "manual", notes }`. Every revision is immutable; saving a correction creates a new revision. The 24 bundled practice IDs are reserved and cannot be overwritten.
5. `reviewDraft(versionId, review, actorId)` records a human approval or rejection with a reason and explicit checks for reference, context, meaning, safety, rights, and original explanation. Approval requires all checks. Mechanical schema checks and an AI response are never human approval. The current role policy allows an authorized editor to review their own draft; a two-person editorial policy is not automatically enforced.
6. `publish(versionId, actorId)` requires the latest human review to approve the unwithdrawn version and rechecks current source rights. `withdraw(versionId, reason, actorId)` removes that version from eligibility permanently; corrections require a new revision. Explicitly revoking edition rights deactivates its publications. Restoring rights does not silently reactivate them; publish deliberately after review. Superseding a revision retains its evidence but removes it from the current pool. Published/withdrawn content cannot be edited in place.

The intended content structure remains linked reference → original plain meaning → hypothetical everyday example → concrete action. Human reviewers must verify passage context, tradition and audience, avoid unsafe applications and fabricated authority, and distinguish quotation from original explanation. Structured output does not establish truth or theological correctness. See [the editorial design and implementation boundary](ai-content-design.md) for the rationale, current limits and outstanding review policies.

The adapter follows the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). An editor must first verify the configured model and account against current official documentation. No model or price is hardcoded here.

## Read contracts and delivery eligibility

- `listEditions(actorId, { cursor?, limit? })`, `listDrafts(actorId, { cursor?, limit?, editionId? })`, and `listReviews(versionId, actorId, { cursor?, limit? })` return `{ items, nextCursor, total }`. Edition entries include derived `eligibleForDraft` and `eligibleForAi` flags that account for the source gate, complete import and current Canadian usage permissions. Pages default to 30 and cap at 100. `getVersion(versionId, actorId)` includes passage context, draft, provenance and current review/publication/withdrawal state for authorized editors. Draft pagination uses stable UUID ordering, not a claim of chronological order; reviews use audit sequence ordering.
- `coverage(editionId)` separates expected/imported book, chapter and verse counts from draft/review counts, current eligible published practice count, and distinct referenced verses. Overlapping published ranges are counted once. It does not claim every verse has an appropriate lesson, and no “intentionally excluded” classification workflow is implemented yet.
- `listPublished({ source?, topics?, cursor?, limit?, use? })` returns current eligible `PublishedPractice` records with `nextCursor` and `total`. Use is `display` by default, or `email`/`sms` for the relevant delivery permission. Consumers must follow cursors and label any loaded subset honestly. No fallback to another scripture collection is performed.
- `getPublished(practiceId, use?)` and `getPublishedVersion(versionId, use?)` return the eligible current revision or `null`. The latter deliberately excludes superseded, withdrawn, expired, unapproved and disabled-source versions. Delivery integration must persist the exact selected version and recheck it immediately before submission; it must not silently replace a cancelled revision with another lesson.
- `selectForDelivery({ source, topics }, occurrenceKey, channel)` deterministically ranks the full eligible publishing pool in PostgreSQL and compares its best candidate with the bundled collection. It does not fetch the whole corpus or truncate candidates to a first page. MD5 is used only as a repeatable ordering function, never for credentials, signatures or corpus integrity. Equal occurrence keys and eligible pools produce equal choices across channels; different channel permissions can change the pool. This does not implement a recent-history exclusion or equal source-balancing policy.
- Public records contain the `Practice` fields plus version/revision, edition title/ID, corpus checksum, passage key and publication timestamp. They omit rights evidence, operator identifiers, review comments and source-text context. SMS receives a server-created collection/reference prefix. Count the final full SMS including identity and opt-out wording against the actual segment quote.

Mutations use parameterized queries in a transaction. Edition rows serialize approval/import/publication changes; practice revisions use a transaction advisory lock. Database triggers preserve imported text, versions, and event history. RLS and grants prohibit member/anonymous direct access. Those controls do not protect against a fully privileged database owner, establish reviewer qualifications, or replace a backup/retention policy.

Two narrow database functions expose eligibility without exposing editorial tables: `app.content_practice_available(text)` returns only a boolean to authenticated members/service code; `app.content_version_available(uuid, text)` is executable only by service code and additionally checks the requested delivery use. Both have a fixed empty search path. Member mutation validation accepts a syntactically valid practice slug, then `mutateMember` checks current eligibility inside its existing revision transaction. Imported IDs require an explicit server `allowPublished` capability. Removing a saved/completed record or clearing a reflection remains possible after withdrawal.

## Live member catalogue

Authenticated `GET /api/practices` combines the bundled and currently published collections. It supports `source`, comma-separated `topics`, `q`, `cursor`, `limit` (1–100), `saved=true`, or an `ids` list of at most 100. Responses contain `{ items, nextCursor, total, updatedAt }`; searches include plain meaning, everyday example, and action, and SQL wildcard characters are treated literally. One lexicographic cursor spans both collections. Like other live APIs, responses are private and not cached. Availability and totals may change between pages when editors publish or withdraw; consumers deduplicate IDs and can refresh from the beginning.

`GET /api/practices/[id]` returns `{ practice }` or an unavailable 404. The live `/practice/[id]` page resolves on the server without changing the existing static preview `/library/[slug]` route. History and reflections retain their records when the referenced lesson is withdrawn; links open the current version when available, not a claim to reconstruct the original completed revision. Delivery records separately retain the version chosen when scheduled.

The live library uses server search and explicit page loading. Today initially loads up to 100 matching practices, labels that loaded set, and offers further loading; its browser random button chooses from that set rather than pretending it has loaded the entire catalogue. The server delivery selection described above uses the full eligible pool. Catalogues refresh when the window regains focus or a user refreshes; no real-time push is claimed. Current history/message titles are optional metadata loaded in batches of 100, capped at 1,000 unique IDs per rendered set; older records remain visible with links and honest fallback labels.

## Verification and remaining work

The content tests use generated synthetic records, mocked OpenAI fetch responses, and embedded PostgreSQL/PGlite with simulated Auth. They exercise checksums/inventory failures, atomic imports, role checks, separate AI permission, review gates, immutable evidence, pagination, superseded/withdrawn records, rights revocation, provider refusal/timeout/size limits, and CLI dry runs. PGlite uses one session; these are not proofs of live multi-session races or provider integration.

Before release: obtain and independently verify real source editions and complete verse inventories, document actual rights and attribution for all uses/territories, rehearse full imports, assign trained reviewers, configure provider access/budgets and operational limits, test a real authorized drafting call, and verify the catalog/delivery integration on the intended deployed revision. No real edition import, live model call, hosted CI run, or deployment is claimed by this document.
