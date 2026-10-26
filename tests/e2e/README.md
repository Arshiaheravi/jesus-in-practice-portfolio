# Browser verification

The normal `playwright.config.ts` runs the public website and browser-local member preview on ports 3000/3001 after the normal production builds. It excludes `*.live.spec.ts`.

`playwright.live.config.ts` runs the member application in live UI mode on port 3002, using a separate `.next-live` production build. Build and run from the repository root in PowerShell:

```powershell
$env:NEXT_BUILD_DIR = '.next-live'
$env:NEXT_PUBLIC_APP_MODE = 'live'
$env:APP_ORIGIN = 'http://127.0.0.1:3002'
$env:SUPABASE_URL = 'http://127.0.0.1:54329'
$env:SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_fixture'
npx.cmd --yes pnpm@10.26.0 --filter @jesus-in-practice/dashboard build
npx.cmd --yes pnpm@10.26.0 exec playwright test --config=playwright.live.config.ts
```

Use a separate shell or clear those task-specific environment values before building the normal preview. Avoid simultaneous dashboard builds because Next.js can update the shared generated `next-env.d.ts` and TypeScript includes. The build directories themselves are separate and ignored by Git.

## What the live suite proves

- The actual Next.js authentication proxy calls a loopback-only Supabase-shaped `/auth/v1/user` fixture. A synthetic, HTTP-only session cookie is accepted only by this fixture. There is no application authentication bypass or production test-user option.
- Named `mocked` tests intercept browser API responses to exercise live UI states: authentication errors, data loading, server saves, conflict drafts, separate phone proof and channel consent, changed SMS rates requiring a new choice, wallet actions, pagination, delivery status, account deletion and accessibility. They do **not** establish real database, Supabase, Stripe, Resend or Twilio integration success.
- Named `real local HTTP` tests issue actual requests to the local Next.js server to check anonymous private access, mutation origin validation, health and missing-dependency failure behavior. The local auth fixture remains synthetic; database and provider credentials are explicitly unset in the server harness.
- Browser requests to unexpected external origins are blocked, and every member API needs an explicit fixture. The hosted Checkout page is an intercepted static test response, never a real payment page.

The fixture server binds only to `127.0.0.1:54329` and rejects unknown bearer tokens or endpoints. The harness refuses to reuse existing servers, keeping configuration errors visible. Playwright closes both processes after the run. All recipients, accounts, tokens and payment references are fictitious `.test` fixtures. Do not substitute real credentials or real personal data.

Traces, failed screenshots and the HTML report are written under `output/playwright/live-*`. They contain synthetic fixture data only. Provider adapter tests, database transaction tests and authorised provider sandbox/real-recipient verification remain separate layers of evidence.

Successful relevant journeys also capture `live-account-desktop.png`, `live-wallet-desktop.png`, `live-deliveries-desktop.png`, and `live-account-mobile.png` under `output/playwright` for visual review. The operator, address, recipient, balances and delivery statuses shown are test fixtures.
