# Contributing

Start with the [README](README.md) and [project instructions](AGENTS.md). Preserve the
Next.js, React, TypeScript and Tailwind workspace and the Heritage design. Keep changes
small enough to explain and review.

## Development

1. Use pnpm 10.26.0 and its managed Node 22.23.3 runtime.
2. Install with `pnpm install --frozen-lockfile`, then run `pnpm dev`.
3. The default preview needs no accounts or credentials. Use synthetic content and
   `example.test` addresses in tests. A preview sign-in is not authentication.
4. Add focused regression coverage for meaningful behavior changes. Follow the
   [testing guide](docs/testing.md) for browser, API and PostgreSQL checks.
5. Run formatting, lint, types, tests and builds before opening a pull request. For a
   changed user journey, include the corresponding browser check and screenshots.

On Windows, use `npx.cmd --yes pnpm@10.26.0` when the pinned pnpm is not on PATH.

## Review boundaries

- Do not commit `.env.local`, provider credentials, database exports, real account
  records, local screenshots containing personal data, or paid template archives.
- Keep provider adapters server-only. Preview state is never evidence of identity,
  consent, payment or credit.
- Keep schema changes versioned; never modify an already applied migration. Review
  RLS and transactional behavior with the separate-session PostgreSQL tests.
- Document configuration changes with blank or synthetic examples. A provider must
  remain disabled until its adopter-owned configuration is validated.
- Use only redistributable assets and preserve required attribution and licence text.
- Do not add automatic production deployment or a workflow that exposes secrets to
  pull requests. The portfolio workflow verifies code using disposable fixtures.

Describe the problem, final behavior, checks run and meaningful limitations in the
pull request. Report security concerns through [SECURITY.md](SECURITY.md).
