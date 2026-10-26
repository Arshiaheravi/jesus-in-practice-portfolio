# Backend dependency review

Reviewed npm package metadata, published engines, license, repository ownership and lifecycle scripts on 2026-10-17 before installation. Versions are exact and recorded in workspace lockfiles; existing framework versions are unchanged.

| Package               | Version | Purpose                                                      | Source / license                           |
| --------------------- | ------- | ------------------------------------------------------------ | ------------------------------------------ |
| @supabase/ssr         | 0.12.7  | Server request cookies; no browser auth client               | github.com/supabase/ssr, MIT               |
| @supabase/supabase-js | 2.118.0 | Auth verification and account administration                 | github.com/supabase/supabase-js, MIT       |
| pg                    | 8.23.1  | Parameterized SQL and bounded connection pool                | github.com/brianc/node-postgres, MIT       |
| stripe                | 23.0.0  | Hosted Checkout and signed webhooks                          | github.com/stripe/stripe-node, MIT         |
| resend                | 6.34.1  | Email API and Svix webhook validation                        | github.com/resend/resend-node, MIT         |
| twilio                | 6.2.0   | Verify, Canadian-number lookup, SMS and signature validation | github.com/twilio/twilio-node, MIT         |
| zod                   | 4.6.7   | Runtime request validation                                   | github.com/colinhacks/zod, MIT             |
| @electric-sql/pglite  | 0.5.10  | Development-only PostgreSQL WASM tests                       | github.com/electric-sql/pglite, Apache-2.0 |
| @types/pg             | 8.23.1  | Development-only SQL types                                   | DefinitelyTyped, MIT                       |
| server-only           | 0.0.1   | Build-time client/server import boundary                     | React server-only marker, MIT              |

All installed engines support the pinned Node 22.23.3. No new install/postinstall script was authorized; the existing pnpm allowlist remains sharp and unrs-resolver only. Provider SDKs remain server-side and use bounded requests. PGlite is a test dependency, not the deployment database. No new MCP server or account connection was installed.

## Architecture references

- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client): request-scoped clients, cookie refresh, no private response caching.
- [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless): configure token email templates and custom SMTP.
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication): authorize data access as well as routes.
- [Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy): dynamic nonce protection for the live member app.
- [PostgreSQL row locks](https://www.postgresql.org/docs/current/sql-select.html): atomic queue claims and short transactions.
- [PGlite API](https://pglite.dev/docs/api): isolated SQL verification without installing a database service on this machine.

See `provider-setup.md` for provider-specific documentation and actual account setup. An npm audit is part of final verification; this dependency review does not claim absence of vulnerabilities.
