# Defensive security review

Reviewed **2026-10-26** for the public portfolio source release. This review covers the application trust boundaries and the fixes below. It is not a penetration-test certification, a claim of perfect security, or evidence that an adopter's accounts, hosting, or provider settings are secure.

## Scope and method

Read the Next.js API/session/operator boundaries, provider adapters, database transaction and row-level-security design, consent/suppression paths, wallet and refund workflows, content drafting, and operational configuration. Verification uses isolated fixtures and existing regression suites; no owner credentials, production database, real recipient or payment was used for this review.

Public history/asset review, dependency audits, browser behavior, and the final CI revision are recorded separately in [verification evidence](verification.md). See [testing](testing.md) for reproducible commands and what each layer proves.

## Fixed findings

### SEC-01 — Original-operator contact was not portable

**Severity:** Medium privacy/portability. **Status:** Fixed.

The server previously embedded an original-operator support contact, which would have remained in an adopter's consent identity and Resend reply-to address. Forked deployments could direct private support correspondence to the wrong person.

The server now requires a validated `SUPPORT_EMAIL` supplied by the adopter. Missing or invalid contact information disables operator identity-dependent consent, messaging and checkout. Bootstrap returns no substitute operator, and release preflight checks the same contact requirement. The public UI likewise receives configured operator contact rather than a private fallback.

Implementation: [server contact configuration](../apps/dashboard/lib/server/config.ts#L59), [bootstrap identity](../apps/dashboard/lib/server/member.ts#L32), [provider reply-to](../apps/dashboard/lib/server/providers.ts#L24), and [release configuration](../scripts/release-preflight.mjs#L17).

Regression evidence: `server-config.test.mjs`, `member-capabilities.test.mjs`, `operations-readiness.test.mjs`, and `release-preflight.test.mjs` exercise missing, invalid and valid synthetic contacts without contacting a provider.

### SEC-02 — Local application-origin validation accepted non-HTTP schemes

**Severity:** Low configuration hardening. **Status:** Fixed.

The local-host exception did not explicitly restrict the protocol. This was an environment-setting validation issue, not evidence of an unauthenticated authorization bypass.

`APP_ORIGIN` accepts HTTPS origins, with HTTP limited to explicit loopback hosts. Paths, query strings, fragments, embedded credentials and control characters are rejected. Invalid values produce the same safe configuration error rather than exposing parsing details. Release preflight applies the same raw-input validation before URL normalization.

Implementation: [origin validation](../apps/dashboard/lib/server/config.ts#L33). Regression evidence: `server-config.test.mjs` checks accepted local/HTTPS origins and rejected configurations.

### SEC-03 — Optional AI drafting cleanup could outlive its caller deadline

**Severity:** Medium availability. **Status:** Fixed.

The adapter relied on transport abort and awaited response cancellation. A transport or stream that did not settle could keep an operator draft request pending beyond its stated limit.

An independent deadline now covers response headers and the complete body. Cancellation is requested without blocking the error path, readers are released, and late responses are discarded. The adapter still makes a single request and never automatically retries paid drafting.

Implementation: [drafting deadline](../packages/backend/src/content-ai.ts#L123) and [bounded body reader](../packages/backend/src/content-ai.ts#L256). Regression evidence: `content-ai.test.mjs` checks ignored abort, late responses, stalled bodies, and non-settling cancellation using synthetic streams.

### SEC-04 — Test helpers accepted unchecked connection options

**Severity:** Medium test-tool safety. **Status:** Fixed.

Two local database helpers checked the fixture host and then passed the remaining JSON settings directly to the database driver. Additional options could alter the connection behavior after that check. This concerns explicitly invoked local test tools, not a public application endpoint.

The shared [fixture configuration reader](../scripts/test-postgres-fixture.mjs) now bounds file size, validates the fixed loopback identity, rejects unexpected fields, and constructs explicit connection settings with bounded timeouts. Trusted nonempty startup options also prevent ambient settings from changing the intended test session. Isolated regression tests exercise the configuration boundary without contacting a server; the disposable PostgreSQL and recovery checks verify the supported path.

## Reviewed safeguards

| Boundary           | Implemented protection                                                              | Relevant verification                                              |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Member identity    | Server-verifiable Supabase user; confirmed email; HTTP-only cookies                 | API fixtures and real HTTP checks with synthetic identity          |
| Browser writes     | Exact configured Origin; strict JSON schemas; bounded body size/time                | Server HTTP, phone and operator route tests                        |
| Operator actions   | Active database role; AAL2; recent TOTP for financial actions; audit records        | Operator API and database tests                                    |
| Private data       | Parameterized queries; transaction-local claims/roles; RLS; private schema          | Embedded and independent-session PostgreSQL tests                  |
| Financial state    | Integer cents; durable operation IDs; immutable ledger; validated provider evidence | Funding, reservation, refund, reconciliation and concurrency tests |
| Messaging          | Destination verification; independent consent; suppression; pre-send rechecks       | Consent, queue, delivery, webhook and waiver tests                 |
| Provider callbacks | SDK signature verification; mode/account matching; idempotent processing            | Isolated signed callback tests                                     |
| Service failures   | Bounded waits; safe error categories; explicit uncertain outcomes                   | Provider, AI and operations failure-path tests                     |
| Content            | Approved source inventory; bounded drafting; immutable human review/publication     | Corpus, editorial, catalog and AI tests                            |

## Limits and adopter responsibilities

No additional high or critical defect was identified in the reviewed application boundaries. This is a scoped review result, not proof that no defect exists. Tests cover selected behaviors, and future dependency, configuration or code changes can introduce new risks.

- Configure your own Supabase project, restricted runtime database role, server credentials, trusted origins and operator contact. Keep the private `app` schema outside the public Data API.
- Verify real OTP/MFA, provider permissions, webhook delivery, messaging approval and payment/refund journeys in your own isolated service environments before activation.
- Review deployment headers, proxy trust, secrets access, provider budgets, scheduled jobs, external alerts, off-device backups and recovery using the actual target environment.
- Source permissions and human editorial review remain necessary for expanded content. Optional AI is not a source of independent scriptural authority.
- No production load, hosted disaster recovery or independent third-party security assessment is claimed by this portfolio release.

Report security concerns using the [security policy](../SECURITY.md), without posting credentials or personal data in public issues.
