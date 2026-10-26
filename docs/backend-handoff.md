# Backend architecture and handoff

This records the implemented boundaries: authenticated accounts, free email reminders, prepaid SMS, provider callbacks, an operator workspace, rights-gated content publishing, and operational tooling. Default mode remains a browser-local preview. External setup and production verification remain release gates; implemented code and local tests do not establish live service success.

## Responsibilities

| Location                           | Responsibility                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website`                     | Public Heritage website, source-aware practice library, free account/email and prepaid SMS explanation, live-mode redirects to member authentication                         |
| `apps/dashboard/components`        | Preview/live context, awaited mutations, conflict-preserving drafts, account/phone/consent, paginated journey/messages/wallet                                                |
| `apps/dashboard/lib/member-api.ts` | Browser HTTP boundary, bounded requests, safe error feedback, conversion of a single UI edit into an explicit command                                                        |
| `apps/dashboard/app/api`           | Same-origin API endpoints, verified sessions or provider signatures, validation, rate limits, private response headers                                                       |
| `apps/dashboard/lib/server`        | Server-only configuration, Supabase session clients, database runtime, provider construction, delivery worker                                                                |
| `packages/backend/src`             | Typed contracts, validation, transactions, scheduling, credit arithmetic, provider adapters, content corpus/editorial workflow, financial operations and readiness/retention |
| `apps/dashboard/app/operator`      | MFA-protected operational overview, content review/publishing, and financial support controls                                                                                |
| `database/migrations`              | Versioned PostgreSQL schema, RLS/grants, financial records, queue/leases, operator audit, immutable content, retention and support waivers                                   |
| `packages/content/src/index.ts`    | 24 original bundled practices with stable IDs and source links; separate from imported editorial versions                                                                    |
| `deployment` and `scripts/ops-*`   | Container/reverse-proxy examples, bounded scheduler/monitor, encrypted backup and isolated restore tooling                                                                   |

The applications retain Next.js 16, React 19, TypeScript, and Tailwind 4. Provider SDKs stay behind server adapters. The operator workspace shares the dashboard deployment; there is no separate microservice, browser database client, or subscription engine.

## Modes and identity

`NEXT_PUBLIC_APP_MODE=preview` uses the existing browser-local provider. It sends no account, message, or checkout requests and keeps the recovery/reset behavior. `live` selects `MemberProvider`, which loads authenticated API state, awaits server-authoritative saves, rejects overlapping mutations, refreshes on focus, and preserves unsaved drafts during revision conflicts. It does not import preview preferences or notes. A changed identity remounts consumers; session loss clears the account view. `ACCOUNT_DELETING` offers retry-deletion/sign-out without requiring a successful bootstrap.

Supabase email OTP handles both account creation and sign-in; no password or client demo code is accepted by live APIs. Auth cookies are HTTP-only, SameSite=Lax, and Secure on HTTPS. The Next proxy refreshes/verifies sessions and protects private pages; every private API independently verifies the session. Live responses are private/no-store, member pages stay noindex, and a per-request CSP nonce supports Next/next-themes scripts. Index controls are not authorization.

The public and member applications use separate canonical origins. Browser writes must originate from the member origin. There is no broad cross-origin credential allowance or browser-supplied account ID. Source, channel, legacy `plan`, wallet, and consent values in a browser cannot grant privileges.

## Persistence and consistency

The private PostgreSQL `app` schema is not exposed through Supabase's Data API. The server connection uses transactions with local database roles and verified user claims; RLS protects user-scoped reads/writes. Server-only service operations handle contacts, consent, queue, webhooks, and money. Parameterized queries, statement/lock timeouts, bounded pools, and verified TLS for remote PostgreSQL are implemented. Protect the connection credential: it can invoke service operations and must never enter the browser.

`POST /api/member` accepts a revision and one typed command. A stale revision returns 409; there is no silent last-write-wins replacement of a complete account object. Schedule/channel/time-zone changes are atomic. Saved practices and completion changes express their desired state. Reflections are limited to 1,500 characters and never included in reminder bodies.

History, wallet activity, and message records use stable cursor pagination. The bootstrap includes only the initial completion page; the UI distinguishes loaded days from the server's total. Account export reads the full stored record collection and rejects responses over 10 MiB with a support-assisted export message rather than silently truncating them. The public website uses bundled lessons; the authenticated live catalogue can also return currently eligible published editions. Private API responses are not shared-cacheable. Detailed route contracts are in [backend API](backend-api.md).

## Content and operator boundaries

The shipped library contains 24 original reflections, not a complete scripture text. The implemented importer validates an approved edition manifest, exact artifact checksum, and independently reviewed chapter/verse inventory before an atomic complete import. KJV English and Book of Mormon English are the supported text families. Edition permissions must cover the actual territory and use; the global source-rights switch defaults off. No real edition has been imported or approved by this implementation work.

Editors can draft manually or use the optional server-side OpenAI Responses adapter. AI drafting requires an explicit model/key and enabled flag; one bounded structured-output request uses only trusted passage/context, never member reflections or contact details. Current AI verification uses synthetic responses. Immutable versions require explicit human approval before publication; withdrawal, rights expiry/revocation, and capability switches remove imported content from eligibility. There is no automatic unreviewed generation or sending. See [content pipeline](content-pipeline.md) and [editorial design](ai-content-design.md).

Live catalogue search and pagination merge the bundled practices with eligible published versions. Member writes recheck eligibility in the transaction; removing a saved item or clearing a note remains possible after withdrawal. Delivery selection ranks the entire eligible pool deterministically for each occurrence, rather than choosing only from a loaded browser page. Queue records retain the selected version, and submission rechecks that exact version. Browser Today randomness operates on its disclosed loaded set. Historical completions refer to a practice ID and show its current available content; they are not a snapshot of its original wording.

Operator access is granted explicitly in the database, never inferred from email or editable identity metadata. Routes verify the active `admin`, `support`, or `editor` role plus Supabase AAL2. Finance and delivery-waiver mutations also require recent TOTP verification. Repositories recheck role authorization and record relevant decisions in append-only audit records. Support cannot publish content or execute admin financial actions. See [operator guide](operator-guide.md) for enrollment, role administration, and bounded support views.

## Consent, schedules, and messages

Email and SMS consent are independent server events associated with the verified destination, wording version, and time. Selecting a channel, verifying ownership, signing in, and purchasing credit do not grant recurring-message consent. Consent cannot be enabled for an unidentified operator. Suppression records use keyed destination digests, so deletion/re-registration cannot silently bypass a prior withdrawal. Email unsubscribe is token-protected POST; GET only shows a confirmation page. SMS STOP withdraws permission; carrier START alone does not restore product consent.

The worker plans from source/topic-eligible practices and the member's IANA time zone. Fixed schedules allow one to three daily times; a same-day window selects one deterministic local minute. Selected weekdays apply. It examines the current minute plus the previous four; missed DST times are skipped, repeated local times share a deduplication key, and long outages do not trigger unlimited backfill. Message intents expire ten minutes after their scheduled occurrence.

Queue records freeze the rendered body, content version, destination/consent versions, schedule occurrence, and SMS quote. Submission rechecks current preferences, consent, suppression, contact version, rate, funds, pause/deletion, source rights/publication, and per-channel daily limits. A worker lease and claimed-delivery leases coordinate processing. Provider acceptance is `submitted`; `delivered` means a provider reported delivery, never that a person read or practised the lesson. Unknown outcomes remain explicit and are not blindly resent. See [operations](operations.md) for capacity, recovery, and reconciliation limits.

## Money

Accounts and email remain free. The server allowlists one-time CAD top-ups of 1,000/2,500/5,000 cents. Stripe hosts card entry. The server verifies paid Checkout state, currency, amount, owner, and funding identity before crediting; repeated webhooks cannot fund an operation twice. Returning from checkout is not payment proof. There are no recurring plans or automatic top-ups.

SMS uses an approved server rate per segment and a frozen full-message quote, capped at ten segments. The wallet ledger reserves funds before submission, keeps uncertain/submitted holds, settles on confirmed delivery, and releases on terminal failure. Provider costs may differ from the member's retail debit; reconciliation must account for charges on failed/undelivered messages. The implementation does not turn provider USD pricing into an undisclosed CAD price.

Refund/dispute callbacks freeze affected wallets for operator review. An authorized admin can request an idempotent refund against an eligible Checkout; a durable hold precedes the provider call, and bounded maintenance reconciles the result. Financial resolution validates provider evidence before releasing restrictions. There is no member self-service balance editor or automated dispute-defense submission. An audited admin waiver can release an uncertain SMS hold under an approved commerce policy without falsely marking the message failed or resending it; late callbacks cannot charge that waived reservation again. Deletion remains blocked while unresolved funds/activity/review remain. See [financial operations](financial-operations.md) for state transitions, limits, reconciliation, and operator decisions.

## Operational implementation

The repository includes container and reverse-proxy configuration, separate delivery/maintenance leases, authenticated aggregate readiness, a bounded scheduler/monitor, configurable retention, encrypted backup, and isolated restore tooling. Readiness checks configuration and database state and explicitly reports that external services are not verified. Retention remains off without an approved policy. The monitoring token is separate from the mutation-capable cron token. These artifacts and local drills do not create a production host, external scheduler, alert destination, or hosted backup. See [production operations](production-operations.md).

## Remaining boundaries and release gates

- Provider accounts/credentials, approved origins, a hosting target, and real service checks are external setup; no deployment is established here.
- Legal operator name/address, SMS rate, tax/refund/unused-credit terms, retention periods, and approved consent/privacy wording remain required owner inputs. Configure your own public `SUPPORT_EMAIL`.
- Verification includes isolated embedded-database tests, synthetic provider/AI responses, mocked live-browser APIs, and documented local PostgreSQL/restore exercises. See the [verification report](verification.md) for executed checks and exact limits; earlier reports are historical. None establishes hosted RLS deployment, real SMTP/SMS/payment/AI success, hosted CI, or production recovery.
- Production alerts, schedules, provider reconciliation, retention/refund policies, and backup/restore evidence for the actual host must be configured and reviewed. A health response only proves process reachability.
- The importer and coverage reports exist, but zero real corpora are imported and the available baseline remains 24 bundled lessons. Full text inventory, reviewed passage coverage, and the number of published practical lessons are separate measures; do not claim full scripture or endless unique lessons.

Use [release](release.md), [operations](operations.md), [provider setup](provider-setup.md) together. Record verification for the tested revision; earlier frontend reports remain historical evidence only.
