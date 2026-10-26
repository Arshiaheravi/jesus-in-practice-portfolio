# Portfolio verification

This record covers the public source edition prepared on **2026-10-26**. Verification uses a separate checkout without private environment files, provider credentials or customer data. The GitHub Actions badge and [workflow runs](https://github.com/Arshiaheravi/jesus-in-practice-portfolio/actions/workflows/frontend.yml) identify checks for each exact published commit.

## Executed checks

| Check                                | Result                                                                                   | Scope                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Frozen installation                  | Passed                                                                                   | Pinned pnpm 10.26.0 and managed Node 22.23.3                                     |
| Dependency audits                    | Seven passed; zero reported findings                                                     | Root tooling, full and production scopes for both apps and backend               |
| Public source scan                   | Passed for the public source export                                                      | Gitleaks plus source allowlist, personal-data and relative-link review           |
| Static checks and application suites | Passed: formatting, lint, types and 219 tests; zero failures/skips                       | Formatting, lint, TypeScript, content/domain/API regressions                     |
| Production builds                    | Both production builds and the separate live-mode dashboard build passed                 | Actual Next.js application builds                                                |
| Browser journeys                     | 54 preview and 31 mocked live-mode journeys passed                                       | Preview and mocked live-mode tests                                               |
| Visual/accessibility review          | Passed                                                                                   | 61 route visits, 10 axe scans, two keyboard focus checks; 320/390/1440px layouts |
| Independent PostgreSQL sessions      | Ten passed after fixture hardening                                                       | Actual locks, transactions, RLS and financial concurrency                        |
| Actual HTTP/PostgreSQL               | 21 passed: member/operator routes, persistence, conflicts, isolation, export and consent | Actual Next routes and database, synthetic authentication                        |
| Encrypted logical recovery           | Passed after fixture hardening                                                           | Nine migrations, synthetic data/RLS restoration and five negative cases          |

The visual review reported no browser errors or external requests and produced the four README screenshots. Those screenshots use synthetic preview state and contain no account credentials or private customer information.

## What the layers establish

- Logic/API tests use injected provider responses and isolated database fixtures. They exercise validation, authorization, consent, idempotency, money, content and failure handling.
- Preview browser tests exercise the production-built public and member applications. Live-mode browser tests use a local identity stub and intercepted API responses.
- Independent-session PostgreSQL tests use an actual PostgreSQL 17.11 server. The HTTP runner combines actual Next route handlers and PostgreSQL with synthetic identity; it does not mock application API responses.
- The recovery drill encrypts a synthetic logical backup and restores it to a distinct disposable database. It verifies selected rows, ledger values and RLS, and rejects unsafe restoration inputs.
- Secret scanning includes narrow path-and-value exceptions for explicitly invalid synthetic test credentials. No complete test directory or broad secret rule is excluded.

## Limits

No real SMS/email, payment, AI request, Supabase OTP/MFA, public webhook, host or domain was used for this portfolio verification. Those integrations require the adopter's own accounts, policy and controlled checks. Provider mocks are not evidence of actual delivery or settlement.

The Docker test configuration is supplied for portability. Docker is unavailable on the verification machine; an equivalent disposable native PostgreSQL 17.11 instance was exercised. Cloud/container deployment, managed Supabase disaster recovery, real-world load capacity and complete WCAG conformance are not claimed. Automated audits and code review are not guarantees of perfect security.

The public edition uses fresh Git history. Private launch records, vendor archives, original history, environment files and operational backups are excluded. [Third-party notices](../THIRD_PARTY_NOTICES.md) describe the retained source/asset boundaries. See the [security review](security-review.md), [testing guide](testing.md) and [release guidance](release.md) for details.
