# Project engineering instructions

## Scope and architecture

This public portfolio repository contains the Jesus in Practice website, member app, and backend. No hosting or live-provider activation is part of publishing the source. Preserve Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Public pages live in `apps/website`; the member app and server-only API routes live in `apps/dashboard`; original practice content is shared through `packages/content`; database/domain/provider modules live in `packages/backend`. Versioned SQL lives in `database/migrations`.

`NEXT_PUBLIC_APP_MODE=preview` is the default browser-local demonstration. It cannot authenticate, deliver messages, or take payment. `live` selects authenticated server APIs and requires a rebuild, Supabase Auth/PostgreSQL configuration, and separately enabled provider capabilities. Do not import preview data into an account automatically or use browser fields as proof of identity, consent, payment, or credit. Keep real personal data and secrets out of fixtures.

Heritage is the selected design. Accounts and practice email are free; SMS is prepaid CAD credit, with no subscription or automatic top-up. The shipped content remains 24 bundled practices. A rights-gated scripture importer, bounded AI-assisted drafting, human review/publishing, and a live published catalogue are implemented, but no real corpus is imported or live AI connection verified. Operator access requires an active database role and MFA; financial maintenance and support actions are audited. Keep provider SDKs in server adapters, preserve revision conflicts and uncertain delivery outcomes, and recheck consent/suppression and published-version eligibility before sending. Never expose the private `app` database schema through the public Data API.

Read `design-system/MASTER.md`, `docs/frontend-scope.md`, and `docs/backend-handoff.md` before changing product flows. For backend work also read `docs/backend-api.md` and `docs/operations.md`; use the PostgreSQL skill before database changes. The content, financial, and deployment boundaries are in `docs/content-pipeline.md`, `docs/financial-operations.md`, and `docs/production-operations.md`; operator workflows are in `docs/operator-guide.md`. Keep personal information and credentials out of source, screenshots and history. Third-party asset terms are in `THIRD_PARTY_NOTICES.md`.

## Commands

Use pinned pnpm 10.26.0; it manages Node 22.23.3 for this workspace. On Windows invoke `npx.cmd --yes pnpm@10.26.0` if pnpm is not on PATH.

- Install: `pnpm install --frozen-lockfile`
- Develop both apps: `pnpm dev`
- Formatting: `pnpm format:check` (apply with `pnpm format`)
- Lint: `pnpm lint`
- Types: `pnpm typecheck`
- Logic/content tests: `pnpm test`
- Production builds: `pnpm build`
- Browser journeys: `pnpm test:e2e` after builds
- Serve built apps for review: `pnpm preview`
- Database migrations: `pnpm db:migrate --apply`, only after verifying the target, reviewing SQL, and backing up existing data; credentials must be supplied to that process
- Release configuration checks: `pnpm release:preflight`, with the intended environment supplied; this does not verify providers or authorize release
- Mocked live-mode browser checks: `pnpm exec playwright test --config=playwright.live.config.ts`, after the separate `.next-live` dashboard build described in `docs/release.md`

Follow Explore → Plan → Code → Commit. Preserve unrelated work, verify meaningful user journeys, and make focused local commits. Do not push or deploy without an authorized target and release process. Public-preview indexability must remain disabled until the site origin and release configuration are intentionally set. Dashboard indexing is always disabled; this is not access control.
