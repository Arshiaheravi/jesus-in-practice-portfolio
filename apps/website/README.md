# Public website

The public Next.js application for Jesus in Practice: a responsive Heritage reading experience with scripture references, original practical explanations, real photography, and a searchable 24-practice collection.

## Run locally

Install the workspace from the [root README](../../README.md), then run:

```sh
pnpm dev:website
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). Start the member app on port 3001 with `pnpm dev:dashboard`, or use `pnpm dev` for both. No provider account or credential is needed for the default preview.

## Structure

| Path              | Responsibility                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| `app`             | Public pages, practice details, metadata, loading/error/not-found states        |
| `components`      | Responsive navigation, practice search, message examples, local feedback drafts |
| `lib/site.ts`     | Validated public origins, application mode and indexing switch                  |
| `lib/operator.ts` | Server-configured public support contact; no author mailbox fallback            |
| `lib/help.ts`     | Searchable help content                                                         |
| `public/images`   | Locally served photographs with source credits                                  |

The interface preserves semantic headings, labels, visible keyboard focus, reduced motion, and responsive image sizes. Lora headings and Inter body text use `next/font`; an uncached build needs access to the font source. The [design system](../../design-system/MASTER.md) records the visual decisions.

## Preview and configured mode

The default preview demonstrates account entry using the visible code `123456`. It never authenticates, sends messages, accepts payment, or persists entered contact details. Feedback produces a copyable local draft. A mailto action appears only when the adopter supplies a valid server `SUPPORT_EMAIL`; opening it never sends automatically.

With `NEXT_PUBLIC_APP_MODE=live`, account entry redirects to the member app, which owns authentication and APIs. Both applications must use matching origins and modes, and must be rebuilt after public configuration changes. See [provider setup](../../docs/provider-setup.md) for separately enabled capabilities.

Set `SUPPORT_EMAIL`, `OPERATOR_NAME`, and `OPERATOR_MAILING_ADDRESS` to the adopter's public contact details before activating a service. Keep credentials out of all `NEXT_PUBLIC_*` values. Example settings in [.env.example](.env.example) contain no working account information.

Public indexing is disabled by default. Enabling it requires an intentional HTTPS origin and reviewed public content; there is no hosted deployment associated with this portfolio project.

## Verification and provenance

Run `pnpm --filter @jesus-in-practice/website lint`, `typecheck`, and `build` from the root. The shared Playwright suite covers page inventory, navigation, source filtering, form validation, no-results states, keyboard interactions, mobile layout and automated accessibility checks. Automated results do not establish complete accessibility conformance.

See [third-party notices](../../THIRD_PARTY_NOTICES.md) and [asset credits](../../docs/asset-credits.md) before redistributing assets. Photography depicts artwork and illustrative situations, not customers, endorsements, or historical photographs of Jesus.
