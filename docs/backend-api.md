# Backend API contract

This documents the implemented first-party member, catalogue, operator and job APIs, not a deployed public developer API. Routes live under the canonical dashboard origin. It is a code-reviewed contract; no generated OpenAPI artifact or schema-conformance test is claimed. Keep this file aligned with `apps/dashboard/app/api`, the backend contracts/validation, and content schemas when changing routes. Real provider activation is separate from local/mock verification.

## Transport and access

- All routes except health require `NEXT_PUBLIC_APP_MODE=live`. Preview requests return `503 PREVIEW_ONLY`.
- Account routes verify a Supabase session server-side, including confirmed email. Auth uses HTTP-only cookies, SameSite=Lax, and Secure on HTTPS; clients send same-origin credentials. There is no browser bearer-token store or client-selected owner ID.
- Browser mutations require an exact `Origin: APP_ORIGIN` and reject `Sec-Fetch-Site: cross-site`. JSON mutation bodies require `Content-Type: application/json`, are limited to 16 KiB, and use strict schemas that reject extra keys. Logout checks origin without parsing a JSON body.
- Signed webhooks, token-protected unsubscribe, and bearer-protected jobs have separate trust boundaries; they do not require a browser Origin/session. No wildcard credentialed CORS is implemented.
- Private responses use `Cache-Control: private, no-store, max-age=0`. Wrapped routes include `X-Request-Id`. Errors contain a safe category/message and correlation ID, not request bodies, notes, tokens, SQL, or provider payloads.
- Paginated endpoints use opaque base64url cursors, with endpoint-specific bounds of at most 512 characters (300 for catalogue/review cursors). Stop on `nextCursor: null`; returned totals count matching server records, not only loaded rows. History and ledger currently default to 100-record pages; deliveries use 50-record pages. Bounded operator support lists explicitly expose limits and do not claim complete history.

## Account and authentication routes

All success responses below are HTTP 200 unless stated otherwise. “Member” means a verified cookie session is required.

| Method and path                | Access and input                                                                                                                         | Success                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`              | Public, no provider/database check                                                                                                       | `{ "status": "ok" }`                                                                                                                               |
| `POST /api/auth/start`         | Same-origin; `{email}`                                                                                                                   | `{sent:true,message}`; deliberately generic, not proof of delivery or account existence                                                            |
| `POST /api/auth/verify`        | Same-origin; `{email,code}`; 6–10 numeric code characters                                                                                | `{ok:true}` and session cookies; errors do not create a session                                                                                    |
| `POST /api/auth/logout`        | Same-origin                                                                                                                              | `{ok:true}`; signs out the current session, not all devices                                                                                        |
| `GET /api/member`              | Member                                                                                                                                   | Bootstrap described below; initializes the account/profile and verified email contact when needed                                                  |
| `POST /api/member`             | Member; `{revision,command}`                                                                                                             | Updated authoritative bootstrap                                                                                                                    |
| `GET /api/history?cursor=…`    | Member                                                                                                                                   | `{items:[{id,date,recordId}],nextCursor,total}`; `id` is practice ID, `date` is local `YYYY-MM-DD`, `recordId` is the database record ID           |
| `GET /api/deliveries?cursor=…` | Member                                                                                                                                   | `{items:[{id,practiceId,channel,status,scheduledAt,updatedAt,createdAt,quoteCents,segments,failureCode}],nextCursor,total}`                        |
| `POST /api/consent`            | Member; `{channel:"email"\|"sms",enabled:boolean,consentVersion?:string}`; a grant requires the displayed version, a withdrawal does not | `{ok:true}`; refresh bootstrap for current consent                                                                                                 |
| `POST /api/phone/start`        | Member; `{phone}` in `+1` plus 10 digits                                                                                                 | `{sent:true}` only after the provider accepts a challenge; Lookup must identify Canada                                                             |
| `POST /api/phone/verify`       | Member; `{code}` of exactly six digits                                                                                                   | `{ok:true}` only for the matching approved challenge; refresh bootstrap for verified phone                                                         |
| `GET /api/wallet?cursor=…`     | Member                                                                                                                                   | Wallet summary plus `{entries:[{id,kind,amountCents,createdAt}],nextCursor}`                                                                       |
| `POST /api/wallet/checkout`    | Member; `{amountCents:1000\|2500\|5000,operationId:UUID}`                                                                                | `{url}` to hosted checkout; does not itself add credit                                                                                             |
| `GET /api/account/export`      | Member                                                                                                                                   | JSON download with email, export time, profile, saved practices, completions, notes, contacts, consent events, delivery records, wallet and ledger |
| `DELETE /api/account`          | Member; `{confirmation:"DELETE"}`                                                                                                        | `{ok:true}` after deletion; pending funds/activity block deletion, partial identity-provider failure leaves a retriable deletion state             |

Email input is trimmed, lowercased, validated, and limited to 254 characters. Phone challenges expire after ten minutes. The account response exposes a phone only when verified. Phone ownership and a selected channel do not grant SMS consent.

The export is a complete stored-account export rather than the first history page. Responses larger than 10 MiB return `409 EXPORT_TOO_LARGE` and require support-assisted export. No silent truncation is implemented. Export data is private and must not be attached to public issues or logs.

## Member state and commands

Bootstrap shape:

```ts
{
  state: {
    version: 1,
    onboarded: boolean,
    source: "bible" | "book-of-mormon" | "both",
    topics: string[],
    channel: "email" | "sms" | "both",
    timezone: string,
    plan: "explore" | "email" | "both", // legacy presentation field, never an entitlement
    schedule: Schedule,
    saved: string[],
    completed: { id: string; date: string }[], // initial history page only
    notes: Record<string, string>
  },
  revision: number,
  capabilities: { emailDelivery: boolean; smsDelivery: boolean; phoneVerification: boolean },
  operator: { name: string; mailingAddress: string; supportEmail: string } | null,
  account: { email: string; phone: string | null; emailConsent: boolean; smsConsent: boolean },
  wallet: {
    availableCents: number; reservedCents: number; rateCents: number | null;
    enabled: boolean; blockedReason: string | null; supportId: string
  },
  history: { total: number; hasMore: boolean; nextCursor: string | null }
}
```

`rateCents` is the configured CAD retail price **per SMS segment**, not per full message. `enabled` reports current checkout availability, not a guarantee of delivery or provider health. `capabilities` reports whether each channel or phone verification is enabled and has its required server configuration; it does not verify external providers, consent, recipient eligibility or sufficient credit. Missing capability fields are treated as unavailable by the frontend during a rolling deployment. Saved preferences and valid future consent choices remain editable while delivery is unavailable; withdrawal remains available. Financial state is server-owned. Some fields are optional in the TypeScript compatibility contract; current bootstrap returns them explicitly.

A window schedule has one deduplication identity per member/local date/channel, so changing its window or preference revision cannot create a second window occurrence that day. Fixed-time occurrences retain their local-time identity. Both modes remain subject to the overall per-channel daily cap.

`Schedule` is `{mode:"fixed"|"window",times:string[],days:number[],windowStart:string,windowEnd:string,paused:boolean}`. Times use 24-hour `HH:mm`; one to three distinct times are required, even when the selected mode is a window. Days are distinct integers 0–6 (Sunday–Saturday), with at least one selected. Window start must precede end on the same day. Time zones must be accepted by `Intl.DateTimeFormat`. Topics must be unique values from the shared category catalogue; an empty list means all topics.

Every member mutation supplies the last `revision` and exactly one command:

| `type`        | Other fields                                                                |
| ------------- | --------------------------------------------------------------------------- |
| `preferences` | `source`, `topics`, `channel`, `timezone`                                   |
| `schedule`    | `schedule`, `channel`, `timezone`, saved atomically                         |
| `onboarding`  | `source`, `topics`, `channel`, `timezone`, `schedule`; marks setup complete |
| `saved`       | `practiceId`, `saved:boolean`                                               |
| `completion`  | `practiceId`, real calendar `date:"YYYY-MM-DD"`, `completed:boolean`        |
| `reflection`  | `practiceId`, `text` of at most 1,500 characters; empty text removes it     |

Practice IDs are lowercase slugs of at most 80 characters. New saves, completions and nonempty reflections require a bundled practice or a currently permitted published practice; the server checks eligibility within the revision transaction. Unavailable content returns `409 PRACTICE_UNAVAILABLE`. Removing a save/completion or clearing a reflection remains possible after withdrawal. A stale revision returns `409 CONFLICT`. Refresh and reconcile the preserved draft; do not retry with a newer revision while silently overwriting another edit. The API does not accept a whole browser state object, wallet balances, paid-plan assertions, destination verification, or consent as member-command fields. Completion records reference a practice ID, not an immutable wording revision.

## Live practice catalogue

Both endpoints require a member session. The paginated catalogue route has a 180/member/minute read limit; the individual lookup currently has no additional route-specific quota. The public website and default preview use the 24 bundled lessons; the live API merges these with eligible editor-published versions. No real corpus import or generated publication ships with the implementation.

| Method and path           | Input                                                                                                                                                                                  | Success                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `GET /api/practices`      | Optional `source=bible\|book-of-mormon\|both`, comma-separated `topics`, `q` up to 200 characters, opaque `cursor`, `limit` 1–100 (default 24), `ids` up to 100 slugs, or `saved=true` | `{items:Practice[],nextCursor,total,updatedAt}` |
| `GET /api/practices/[id]` | Practice slug                                                                                                                                                                          | `{practice}`; unavailable IDs return 404        |

`saved=true` uses the authenticated member's saved IDs and takes precedence over `ids`. Search covers title, reference, topic, summary, plain meaning, everyday example and action; it is case-insensitive and treats wildcard characters literally. Stable lexical cursor pagination applies after source/topic/search/ID filtering. Rights, territory, expiry, import completion and current publication are rechecked by the repository. Imported records include edition/version provenance but exclude raw corpus text, private reviewer notes and rights evidence.

`GET /practice/[id]` is a private live page with server-side lookup and authoritative 404 behavior; preview `/library/[slug]` remains a separate static route. Client Today randomness is limited to its disclosed loaded set, while delivery selection ranks the full eligible pool. Reading a catalogue page does not imply that every lesson is loaded. See [content pipeline](content-pipeline.md).

## Messages, consent, and credit

Delivery statuses are `queued`, `claimed`, `sending`, `submitted`, `delivered`, `failed`, `unknown`, and `cancelled`. `submitted` means provider acceptance; `delivered` is a provider report, not a read receipt. `unknown` preserves uncertain submission results. Timestamps are ISO instants; the frontend formats them in the selected time zone. The frozen SMS quote and segment count explain a message's price, not proof of a ledger debit. The wallet ledger records reservation/settlement/release.

Consent grants require configured operator identity, a verified destination, and no disqualifying suppression. The bootstrap exposes the configured operator name, mailing address, and support email for display beside the consent controls; unavailable identity disables new grants. Every grant submits `consentVersion`, derived by the client from its bundled consent wording version and, for SMS, the displayed CAD rate per segment. The server compares it with the current version and returns `409 CONSENT_CHANGED` on a mismatch. The UI refreshes the rate/copy and requires another explicit grant; it does not automatically accept revised terms. Email uses the wording version; SMS records that version plus the rate. A rate or wording change invalidates old grants for sending until renewed. Withdrawal omits the version and remains available. Worker planning and submission recheck current consent/version/rate. Withdrawing consent does not require delivery/payment enable flags. A user email-unsubscribe can be replaced by a fresh explicit consent grant; provider complaint/STOP restrictions require their applicable recovery process. `START` alone never reinstates recurring-message consent.

Checkout allows only CAD amounts listed above. The client reuses its UUID operation ID after an uncertain response for the same amount. Funding is durable and tied to verified provider session/payment state; do not create a fresh operation merely because checkout timed out. Attempts older than 23 hours require reconciliation before reuse. Refund/dispute events freeze wallets for support review. Members have no self-service refund or ledger-edit endpoint; the operator financial workflow below makes bounded, audited requests. `supportId` is a wallet reference for authenticated support lookup, not authorization to read another account.

## Operator access and operations

All operator APIs verify a confirmed Supabase identity and active database role; browser-supplied actor IDs and editable user metadata never grant access. Except access enrollment/verification, requests require AAL2. Financial and delivery-waiver writes additionally require TOTP verification within 15 minutes. Every browser mutation retains the same exact-origin, bounded-body and strict-schema rules as member mutations. The [operator guide](operator-guide.md) documents role administration and use; the role-grant CLI is deliberately separate from these browser endpoints.

| Method and path                       | Role and input                                                                                  | Success                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/operator/access`            | Any active operator; setup allowed before AAL2                                                  | `{role,verified,recentMfa,factors:[{id,name}]}` for verified TOTP factors                                                                           |
| `POST /api/operator/access`           | Any active operator; `{action:"enroll"}` or `{action:"verify",factorId:UUID,code}` (six digits) | Enrollment `{factorId,secret,qrCode}`; verification `{verified:true}`                                                                               |
| `GET /api/operator/overview`          | Any operator with AAL2                                                                          | Aggregate readiness report; no member contacts/reflections                                                                                          |
| `GET /api/operator/cases?cursor=…`    | Admin/support with AAL2                                                                         | `{events,nextCursor,deliveries,deliveryLimit:50}`; financial events paginate in batches of 50, deliveries are the oldest 50 unknown/sending records |
| `GET /api/operator/cases?wallet=UUID` | Admin/support with AAL2; lookup is audited                                                      | `{wallet,checkouts,refunds,limit:100}`; checkouts/refunds are bounded latest records, not complete exports                                          |
| `GET /api/operator/finance?id=UUID`   | Admin/support with AAL2; refund operation ID                                                    | `{refund:null\|{id,status,holdState,amountCents}}`                                                                                                  |
| `POST /api/operator/finance`          | Admin with recent MFA; actions below                                                            | Refund request HTTP 202; resolution/cancellation HTTP 200                                                                                           |
| `POST /api/operator/deliveries`       | Admin with recent MFA; `{operationId:UUID,deliveryId:UUID,reason,confirmed:true}`               | `{waiver}` for the audited eligible unknown-SMS reservation waiver                                                                                  |

Enrollment refuses to replace an existing verified authenticator. Returned enrollment secret/QR data is transient and sensitive; do not log it. Recovery of a lost verified authenticator is outside this endpoint. Access writes are limited to 8/operator/10 minutes; overview to 20/minute; support reads to 100/minute; finance writes to 10/10 minutes, and delivery writes to a separate 10/10 minutes.

Financial POST actions require a specific 10–500 character reason and explicit `confirmed:true`:

```ts
{ action: "refund", operationId: UUID, checkoutId: UUID, amountCents: number, reason, confirmed: true }
{ action: "resolve", operationId: UUID, paymentIntentId: string, reason, confirmed: true }
{ action: "cancel-refund", refundId: UUID, reason, confirmed: true }
```

Refund amount is an integer 1–5,000 CAD cents, additionally constrained by eligible funded credit. `refund` returns `{refund:{id,status,holdState,amountCents}}` after a durable request/hold; maintenance contacts Stripe after commit. `resolve` returns `{resolution}` only after required provider evidence; `cancel-refund` returns `{refund}` only through the verified-absence path. An uncertain result is not permission to change the operation payload, release held money or invent a balance adjustment. The delivery waiver requires approved commerce policy and an eligible held unknown SMS reservation; it preserves unknown delivery status, sends nothing and prevents a later debit for that waived reservation. See [financial operations](financial-operations.md).

## Editorial API

`/api/operator/content` requires an active admin/editor with AAL2. Support has no editorial access. Reads are limited to 100/operator/minute and writes to 20/minute. AI generation additionally allows 3/operator/minute and 20 globally/day, with no automatic paid retry.

- `GET` accepts optional `cursor` and `editionCursor`; returns `{drafts,editions,aiEnabled,rightsEnabled}`. Draft pages contain 20 items and edition pages 25; each page has `items`, `total`, `nextCursor`. Edition records include derived draft/AI eligibility, not merely a raw approved flag.
- `GET ?version=UUID&reviewCursor=…` returns `{version,reviews}`, with reviews paginated at 25. Unknown query keys are rejected.
- `POST {action:"manual",practiceId,passage,draft,notes}` returns HTTP 201 `{version}`. Notes are 10–1,000 characters; bundled practice IDs are reserved.
- `POST {action:"generate",practiceId,passage,category}` returns HTTP 201 `{outcome:"draft",version}` or HTTP 200 `{outcome:"insufficient_context",reason}`. The source must permit AI use, and explicit model/key/capability configuration is required.
- `POST {action:"review",versionId,review}` returns `{version}`. Approval requires all six explicit checks: reference, context, meaning, safety, rights and original explanation.
- `POST {action:"publish",versionId,confirmed:true}` returns `{version}` only after human approval and current permissions.
- `POST {action:"withdraw",versionId,reason,confirmed:true}` returns `{version}`; the reason is 10–2,000 characters and withdrawal is permanent for that version.

`passage`, `draft` and `review` follow the strict schemas in `content-contracts.ts`; exact fields and limits are documented in [content pipeline](content-pipeline.md). Published versions are immutable; corrections create new revisions. Review by the same authorized author is currently allowed, so mandatory independent second review is not claimed. Manifest registration, rights approval and complete corpus import remain CLI operations; there is no browser upload or scraping endpoint. No unreviewed model output is delivered automatically.

## Jobs and provider endpoints

| Method and path                                 | Verification / input                                                                                                    | Success                                                                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/jobs/deliver`                        | `Authorization: Bearer CRON_SECRET`; no browser session                                                                 | `{busy:true}` when leased, otherwise aggregate worker counts `planned`, `processed`, `unknown`, `failed`, `planningPending`                                                                                   |
| `POST /api/jobs/maintenance`                    | `Authorization: Bearer CRON_SECRET`; separate maintenance lease                                                         | `{busy:true}` or `{busy:false,finance,retention}`; bounded refund/Checkout reconciliation, optional approved retention                                                                                        |
| `GET /api/jobs/readiness`                       | `Authorization: Bearer MONITORING_SECRET`; separate read-only token                                                     | Aggregate readiness report; HTTP 200 when ready, 503 otherwise; `externalServicesVerified:false`                                                                                                              |
| `GET /api/jobs/status`                          | `Authorization: Bearer CRON_SECRET`; no browser session                                                                 | `{checkedAt,deliveries:[{channel,status,count,oldest}],blockedWallets,pendingWebhooks,planner}`; `planner` is null or `{updated_at,pending}`; unprocessed webhook count covers records older than ten minutes |
| `POST /api/unsubscribe?token=…`                 | Valid signed destination/channel token; body at most 2 KiB; no login                                                    | JSON `{ok:true,message}`, or 303 to `/unsubscribe?complete=1` for HTML clients                                                                                                                                |
| `POST /api/webhooks/stripe`                     | Raw body at most 256 KiB; `stripe-signature`; expected provider mode                                                    | `{received:true}`                                                                                                                                                                                             |
| `POST /api/webhooks/resend`                     | Raw body at most 256 KiB; `svix-id`, `svix-timestamp`, `svix-signature`                                                 | `{received:true}`                                                                                                                                                                                             |
| `POST /api/webhooks/twilio/inbound`             | Form body at most 32 KiB; `x-twilio-signature` validated against canonical URL/account                                  | Empty TwiML response; STOP suppresses, START does not grant consent                                                                                                                                           |
| `POST /api/webhooks/twilio/status?deliveryId=…` | Form body at most 32 KiB; signature covers canonical URL and query, valid message/delivery IDs and matching destination | HTTP 204                                                                                                                                                                                                      |

`GET /unsubscribe?token=…` is a confirmation page, not a state-changing API. Its form performs POST; prefetching a link does not withdraw consent. For authenticated Resend bounce, complaint, and suppression events, validated recipient addresses are hashed and suppressed even if the original account/delivery record has been deleted; no account lookup is required for that destination protection. Provider callbacks are deduplicated durably by event/hash, and body mismatches or provider-ID conflicts are not treated as a new payment/send. See [provider setup](provider-setup.md) for subscribed event names and [operations](operations.md) for registration URLs. The [production operations runbook](production-operations.md) describes bounded cron/monitoring, retention, backups and restore; readiness does not verify external delivery, payments, AI or hosted recovery.

## Errors and throttles

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Safe user-facing explanation",
    "requestId": "correlation-id"
  }
}
```

| Status    | Representative codes and handling                                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400       | `VALIDATION`, `INVALID_CODE`, `INVALID_LINK`, `INVALID_SIGNATURE`: correct input or investigate callback configuration                                                                                                                 |
| 401       | `AUTH_REQUIRED`: clear private UI and sign in again                                                                                                                                                                                    |
| 403       | `FORBIDDEN`, `OPERATOR_REQUIRED`, `MFA_REQUIRED`: origin/token, active role or MFA requirement failed                                                                                                                                  |
| 404       | `NOT_FOUND`: unavailable practice or operator record; do not fabricate a replacement                                                                                                                                                   |
| 408       | `REQUEST_TIMEOUT`: request body did not arrive within the bounded deadline                                                                                                                                                             |
| 409       | `CONFLICT`, `CONSENT_CHANGED`, `CONTACT_SUPPRESSED`, `ACCOUNT_FINANCIAL_REVIEW`, `ACCOUNT_DELETING`, `WALLET_BLOCKED`, `CHECKOUT_CONFLICT`, `OPERATION_CONFLICT`, `EXPORT_TOO_LARGE`, `PRACTICE_UNAVAILABLE`: reconcile or use support |
| 409       | Refund/reconciliation, content-rights/review and waiver conflicts: preserve the current version or financial hold, inspect the specific safe code, and refresh evidence before retrying                                                |
| 413 / 415 | `TOO_LARGE` / `VALIDATION`: bounded body exceeded or JSON content type absent                                                                                                                                                          |
| 429       | `RATE_LIMIT`: `Retry-After: 60`; wait before another attempt, noting the underlying quota window may be longer                                                                                                                         |
| 503       | `UNAVAILABLE`, `PREVIEW_ONLY`, `DELETION_PENDING`, AI configuration/provider errors: preserve uncertainty, not blind mutation retries. Some provider/financial reconciliation errors are 409; inspect the returned status/code.        |

Current database-backed limits include auth start 3/address/hour and 100 global/hour; verification 8/address/10 minutes and 500 global/hour; optional trusted-edge IP limits; member writes 120/member/minute; consent 30/member/hour; phone challenges 3/member/hour and 3/number/hour plus 50 global/hour; phone checks 8/member/10 minutes; checkout 12/member/hour; export 3/member/hour; deletion 5/member/hour. Provider-side limits also apply. Rate-limit identities are keyed digests; do not log raw email or phone identifiers.

Client requests time out after 15 seconds. A timeout does not prove the server did nothing. Reload authoritative state or reconcile the provider operation before another financial/send mutation. This API is not publicly versioned yet; coordinate any breaking change across the two apps and shared contract rather than silently changing field meanings.
