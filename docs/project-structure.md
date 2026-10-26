# Project structure

Two Next.js applications share original practice content and a server-side domain package. The Heritage website and member/operator flows use React 19, TypeScript and Tailwind CSS 4. See [architecture](backend-handoff.md) for trust boundaries and service responsibilities.

```text
apps/website/           Public pages, practice library, metadata and contact UI
apps/dashboard/         Member/operator UI, API routes, sessions and worker entrypoints
packages/content/       24 original reflections and integrity checks
packages/backend/       Domain contracts, repositories, providers and tests
database/migrations/    Ordered schema, RLS, ledger, queues and audit migrations
scripts/                Fixtures, release checks and operational CLI tools
deployment/             Optional host/container examples and test PostgreSQL
shared/                 Typed visual-design catalogue
tests/e2e/              Preview and mocked live-mode browser journeys
design-system/          Heritage visual/interaction guidelines
docs/                   Architecture, setup, evidence and operating guidance
.github/                CI, dependency updates and contribution templates
```

Generated output, `.env.local`, local databases and reports belong outside Git. README screenshots are deliberate reviewed assets under `docs/images`; other browser traces/reports remain ignored.

## Reading order

1. [README](../README.md): run the preview and understand the product.
2. [Testing](testing.md): repeatable checks without provider credentials.
3. [Architecture](backend-handoff.md) and [API](backend-api.md): identity, data and command boundaries.
4. [Provider setup](provider-setup.md) and [operations](operations.md): configure your own installation.
5. [Operator guide](operator-guide.md), [financial operations](financial-operations.md), [content pipeline](content-pipeline.md): privileged workflows.
6. [Security review](security-review.md), [verification](verification.md), [release guidance](release.md): evidence and limitations.

[Contributing](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md) describe engineering conventions. [Third-party notices](../THIRD_PARTY_NOTICES.md) and [asset credits](asset-credits.md) describe licensing boundaries.
