# Testing without provider credentials

The test suite is designed to run on a fresh clone with no `.env.local` files, service
accounts, API keys or customer data. It does not contact Stripe, Twilio, Resend or a
hosted Supabase project. Use a separate clean checkout if your development copy has
real service settings. Keep all tests on loopback; do not point fixture tools at a
real database.

## What each layer proves

| Layer                           | Command                                            | Boundary exercised                                                                                                  |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Static checks                   | `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | Formatting, lint and TypeScript contracts                                                                           |
| Logic and embedded integration  | `pnpm test`                                        | Content, domain, API, financial and provider adapters; provider responses are injected                              |
| Preview browser journeys        | `pnpm test:e2e`                                    | Production-built public/member UI, browser persistence, navigation, responsive and accessibility behavior           |
| Mocked live browser journeys    | `pnpm test:e2e:live`                               | Authenticated/member/operator presentation with synthetic identity and intercepted API responses                    |
| Independent PostgreSQL sessions | `pnpm test:postgres:local`                         | Real transactions, row-level security, locks, idempotency and competing financial operations                        |
| Real HTTP and PostgreSQL        | `pnpm test:http:local`                             | Actual Next server, API/SSR authorization and published content against real PostgreSQL; identity remains synthetic |
| Backup/restore drill            | `pnpm test:recovery:local`                         | Encrypted logical backup, recovery, data/permission checks and rejected unsafe restore cases                        |

No local test establishes real OTP delivery, carrier approval, a real charge, provider
callbacks over public HTTPS, production load capacity or managed Supabase disaster
recovery. Adopters must verify those using their own isolated service environments.

## Install and run the ordinary gates

Use pnpm **10.26.0** and the workspace-managed Node **22.23.3**. These commands work
from the repository root. On Windows, replace `pnpm` with
`npx.cmd --yes pnpm@10.26.0` when necessary.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

On Linux, Playwright may require `pnpm exec playwright install --with-deps chromium`.
Tests default to the Playwright-managed Chromium on every platform. You can explicitly
set `PLAYWRIGHT_CHANNEL=chrome` to check a separately installed Chrome. Free ports
3000 and 3001 before the preview suite; it starts the built apps itself.

## Mocked live-mode browser checks

Build the dashboard into a separate output directory in a fresh shell without real
provider settings. Public mode is a build-time value, so changing it after a build is
not sufficient.

POSIX shell:

```sh
NEXT_PUBLIC_APP_MODE=live NEXT_BUILD_DIR=.next-live SUPPORT_EMAIL=support@example.test pnpm --filter @jesus-in-practice/dashboard build
pnpm test:e2e:live
```

PowerShell:

```powershell
$env:NEXT_PUBLIC_APP_MODE = "live"
$env:NEXT_BUILD_DIR = ".next-live"
$env:SUPPORT_EMAIL = "support@example.test"
npx.cmd --yes pnpm@10.26.0 --filter @jesus-in-practice/dashboard build
npx.cmd --yes pnpm@10.26.0 test:e2e:live
```

Close that shell afterward to avoid carrying the build flags into the normal preview.
The suite owns ports 3002 and 54329, blanks provider credentials and disables sending
and payments. `scripts/mock-supabase-auth.mjs` is a local test double, not a login
service to deploy.

## Real PostgreSQL without Supabase or API keys

Docker Engine with Compose is an optional local test dependency; it is not needed for
the preview or embedded tests. The reviewed Compose file uses the same digest-pinned
PostgreSQL 17.11 image as CI, binds only to `127.0.0.1:55439`, and stores its disposable
data in memory-backed container storage. Its published password is synthetic.

```sh
docker compose -f deployment/compose.test.yaml up -d --wait
pnpm test:db:prepare
pnpm test:postgres:local
pnpm test:http:local
```

The HTTP check also needs the `.next-live` build from the preceding section and free
ports 3003 and 54330. Preparation accepts only the fixed fixture host, administrator and
empty bootstrap database. It creates synthetic Supabase roles and an ignored connection
file at `.local/test-postgres/connection.json`. Re-running preparation validates the
existing synthetic roles. It does not recreate Supabase Auth, SMTP, Storage or Realtime.

Each integration runner uses a distinct database name. HTTP fixtures clean up their
own database and processes. The separate-session and recovery fixtures retain their
synthetic databases for inspection until the disposable container is removed:

```sh
docker compose -f deployment/compose.test.yaml down
```

Stopping/removing this fixture discards its synthetic databases. No real database or
provider configuration belongs in this Compose service.

## Logical backup and restore

Install reviewed PostgreSQL **17** client tools for your platform. Set `PG_BIN_DIR`
to the directory containing `pg_dump` and `pg_restore` (PATH alone is not used), then run:

```sh
pnpm test:recovery:local
```

This creates new synthetic source/recovery databases, a random fixture encryption key
and ignored evidence under `.local/backup-drills`. It verifies rows, ledger values, RLS
and rejection of a nonempty target, a source/target collision, wrong keys, damaged
archives and overwriting an existing backup. These files are test artifacts; real
backup/key storage and recovery require a separate operational arrangement.

## CI and dependency maintenance

[Application checks](../.github/workflows/frontend.yml) runs on pull requests, pushes
to `main` and manual dispatch. It installs frozen lockfiles, runs dependency audits,
the static/logic/build/browser gates, a fresh PostgreSQL service and real HTTP checks.
A separate checksum-pinned Gitleaks job scans the full public history with redacted
output. Fork pull requests need no provider secrets or elevated repository token.

Dependabot proposes reviewed dependency/action updates; it does not merge or deploy
them. Public deployment is deliberately absent from this portfolio workflow.

References: [Playwright browser installation](https://playwright.dev/docs/browsers),
[Docker Compose](https://docs.docker.com/compose/),
[Gitleaks](https://github.com/gitleaks/gitleaks),
[GitHub Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
