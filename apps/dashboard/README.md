# Member app and server APIs

The member application for Jesus in Practice combines a local interactive demo with separately configured authenticated APIs. It runs at [127.0.0.1:3001/dashboard](http://127.0.0.1:3001/dashboard).

## Run locally

Follow workspace installation in the [root README](../../README.md), then run `pnpm dev:dashboard`, or `pnpm dev` for both apps. The default preview requires no service account, credential, or database. Use `127.0.0.1` consistently; browser-local data belongs to that origin.

## Structure

| Path                             | Responsibility                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `app/(member)`                   | Today, library/detail, saves, rhythm, messages, journey, wallet and settings |
| `app/onboarding`                 | Source, topics, channel and reminder setup                                   |
| `app/operator`                   | MFA-protected editorial and financial operations                             |
| `app/api`                        | Authenticated member, operator and signed-provider HTTP endpoints            |
| `components/demo-provider.tsx`   | Validated local preview state and storage recovery                           |
| `components/member-provider.tsx` | Live account loading, awaited mutations and revision conflicts               |
| `lib/demo-model.ts`              | Preview schema, time zones, dates and schedule validation                    |
| `lib/member-api.ts`              | Bounded browser requests and safe error feedback                             |
| `lib/server`                     | Server-only authentication, provider configuration and database access       |

Domain logic and provider adapters live in `packages/backend`; 24 original attributed practices are shared through `packages/content`. The [architecture](../../docs/backend-handoff.md) and [API contract](../../docs/backend-api.md) describe the boundaries.

## Two explicit modes

**Preview** stores preferences, saves, reflections and activity in the current browser. It includes storage-failure recovery, conflicts between tabs, export and reset. It does not authenticate, deliver messages or accept money. Preview data is never silently imported into a live account.

**Configured live mode** uses Supabase email-code authentication and PostgreSQL. Resend email, Twilio verification/SMS, Stripe prepaid credit, and AI drafting are separate capabilities, disabled until the adopter supplies their own settings and completes the relevant checks. Operator tools additionally require an active role and MFA. The portfolio does not include working provider credentials or a hosted service.

Copy [.env.example](.env.example) to an ignored local settings file only when needed; never overwrite an existing private file or publish it. Configure the adopter's `SUPPORT_EMAIL` and legal operator details. Follow [operations](../../docs/operations.md) and [provider setup](../../docs/provider-setup.md) before applying migrations or enabling external actions.

## Interface and verification

Heritage uses ivory/burgundy surfaces, Lora headings, and Inter controls, with light/dark appearances, visible focus, and reduced-motion support. Practices distinguish the scripture reference, original interpretation, everyday example, action and reflection. See [asset credits](../../docs/asset-credits.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).

Run `pnpm --filter @jesus-in-practice/dashboard lint`, `typecheck`, `test`, and `build` from the root. The Playwright suites distinguish browser-local preview journeys from live-interface tests using synthetic identities and intercepted responses. Separate HTTP/PostgreSQL checks exercise actual routes and database permissions with isolated fixtures. None of these substitutes for testing an adopter's real provider account.

The app always emits `noindex`. That is an indexing preference; session checks and server authorization protect private data.
