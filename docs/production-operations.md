# Production operations for adopters

These optional tools do not create a host, scheduler, backup destination or monitoring account. Configure your own secrets, policies and integrations. Follow [release guidance](release.md), [provider setup](provider-setup.md) and [operations](operations.md). Repeatable local checks are documented in [testing](testing.md); current results belong in [verification](verification.md).

## Runtime and release artifacts

`deployment/Dockerfile` builds either Next app with the existing pinned workspace dependencies, Node 22.23.3 and pnpm 10.26.0. The official Node image is pinned by manifest digest. `NEXT_OUTPUT=standalone` enables Next's traced runtime output. Public assets and `.next/static` are copied explicitly. The final image runs as the unprivileged `node` user; the build context excludes `.env*`, local fixtures, vendor downloads, logs and tests. Both public origins and live/preview mode are **build-time** public settings; they are not secrets. Provider credentials belong only in protected runtime configuration.

`deployment/compose.yaml` has separate website, dashboard and optional scheduler services. Website and dashboard bind only to the host loopback ports 3000/3001; a reviewed HTTPS reverse proxy must front them. `deployment/nginx.conf.example` illustrates two TLS origins, request limits and proxy boundaries; replace the example domains/certificate paths and validate the actual host configuration before use. It does not provision certificates or DNS. Docker/Nginx are unavailable in this Windows workspace, so image construction, Linux file tracing, Compose execution and proxy behavior remain unverified for this optional deployment path. These optional artifacts are not prerequisites for the selected Render native-service path, whose own hosted runtime and HTTPS checks remain required.

Supply these Compose interpolation settings through the deployment host's protected configuration:

- `RELEASE_REVISION`: the exact tested Git revision, also used as an image tag; preserve its image digest for rollback.
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DASHBOARD_URL`: approved HTTPS origins.
- `NEXT_PUBLIC_INDEXABLE=false` until public release is deliberately authorized. The member app always remains noindex.
- `WEBSITE_ENV_FILE`, `DASHBOARD_ENV_FILE`, `SCHEDULER_ENV_FILE`: absolute paths to separate protected runtime files outside source control. The website receives no database/payment secrets. The scheduler receives only `APP_ORIGIN` and `CRON_SECRET`.

On the selected, authorized host, after the release gates pass:

```sh
docker compose -f deployment/compose.yaml config --quiet
docker compose -f deployment/compose.yaml build --pull website dashboard scheduler
# Take and verify an encrypted backup before migrating the intended database.
pnpm --filter @jesus-in-practice/backend migrate --apply
docker compose -f deployment/compose.yaml up -d website dashboard
node scripts/ops-monitor.mjs
# Enable only after readiness, sender/consent checks and provider limits are verified.
docker compose -f deployment/compose.yaml --profile operations up -d scheduler
```

The migration command requires the intended secret `DATABASE_URL`; it is not part of the container startup. Existing migration checksums must not be edited. Migration 007 adds the bounded maintenance audit and redaction marker; it does not rewrite financial history. Keep delivery flags false during migration, incident handling and restore. Do not run two independent external schedulers. Roll back app artifacts to the previously verified image when schema-compatible; do not automatically reverse migrations or replace a database with a dump. A recovery database must be separate and verified before traffic switches.

## Scheduler and readiness

`node scripts/ops-scheduler.mjs` sends authenticated POST requests to `/api/jobs/deliver` each minute and `/api/jobs/maintenance` 30 seconds later. The jobs use separate database leases. Each request has a 55-second timeout; the scheduler never overlaps the same endpoint or blindly retries an ambiguous request within the minute. The next scheduled run relies on durable server idempotency. HTTP redirects are rejected. `APP_ORIGIN` must be the canonical member HTTPS origin (loopback HTTP is allowed only for local checks); never derive it from forwarded headers. `CRON_SECRET` must be independently generated and at least 32 characters.

The public `/api/health` is liveness only. Detailed `GET /api/jobs/readiness` requires a **separate** `MONITORING_SECRET` bearer token. `node scripts/ops-monitor.mjs` validates that endpoint using `APP_ORIGIN`, a 15-second deadline covering headers and the entire body, no redirects and a 64 KiB response cap. The independent deadline rejects even if body consumption stalls; it aborts the transport and attempts reader cancellation without waiting indefinitely for cancellation itself. It rejects malformed or inconsistent readiness reports, including an overall success with a failed check. Output is restricted to validated report metadata and aggregate check codes/status/counts/ages; its scope remains database/configuration, with `externalServicesVerified:false`. It exits nonzero on failed readiness and does not log tokens, contact addresses, database strings or raw SQL errors.

The server readiness adapter derives configuration checks from the same effective availability predicates used by email delivery, SMS delivery, phone verification and Checkout. A disabled capability does not require provider credentials; an enabled capability with missing required configuration fails its corresponding check. `inspectReadiness(database, options)` then checks these booleans, database connectivity, expected migration names (and optional supplied checksums), RLS, member write privileges, webhook processing lag, unknown delivery age, blocked wallets and enabled planner/retention freshness. `ready` means these configured checks pass; `externalServicesVerified` is always false. It does **not** certify Stripe/Twilio/Resend/Supabase reachability, sender or live-payment approval, phone verification, email delivery, backup validity, TLS configuration or content accuracy. Aggregate warnings require investigation even when `ready=true`.

`deployment/monitoring.json` is an explicit disabled policy template: run checks every 60 seconds, alert after two failures, and escalate persistent warnings after 15 minutes. Wire an approved external monitoring destination before launch. Include planner lag, queued work, unprocessed webhooks, unresolved delivery results, blocked wallets, maintenance freshness, backup age, restore-drill age and provider budget alerts. Define and approve backup/restore age limits and on-call ownership; none are silently invented here. Validate a synthetic alert and its recovery on the selected host. No notifications are sent by these files.

## Retention

Retention has **no production defaults** and does not start until an operator supplies a reviewed `RETENTION_POLICY_JSON` and explicitly enables `ENABLE_RETENTION=true`. The JSON must contain every field:

| Field                       | Accepted value                                                          |
| --------------------------- | ----------------------------------------------------------------------- |
| `approvalReference`         | 1–200 characters identifying the actual approved policy/change          |
| `approvedAt`                | ISO UTC timestamp, not in the future                                    |
| `expiredPhoneChallengeDays` | Integer 1–3650, counted after challenge expiry                          |
| `rateLimitDays`             | Integer 2–3650, from bucket start; active daily quotas remain protected |
| `terminalPayloadDays`       | Integer 1–36500, after terminal delivery update                         |
| `batchSize`                 | Integer 1–500 per category per run                                      |

The operator must decide and document appropriate periods with privacy/legal requirements. An approval string is an audit reference, not proof of legal review. The application cannot approve its own policy. Before enabling scheduled application, run the default **dry run** against the explicitly identified database:

```sh
node --experimental-strip-types scripts/ops-retention.mjs --expect-target HOST:PORT/DATABASE
# Only after reviewing counts and the approved policy:
node --experimental-strip-types scripts/ops-retention.mjs --expect-target HOST:PORT/DATABASE --apply
```

`DATABASE_URL` and `RETENTION_POLICY_JSON` come from protected environment settings. Dry runs do not delete, redact or write audit rows. Applied runs take a transaction advisory lock, use bounded `FOR UPDATE SKIP LOCKED` selection, and return counts plus `hasMore`. Each applied run records the policy hash, approval reference and counts without user identifiers.

Only expired phone challenges, old quota buckets, and old **terminal** delivery payloads are eligible. Redaction removes destination/message/token payload fields while keeping delivery identity, provider IDs, dates and frozen pricing/segment evidence. Queued, claimed, sending, submitted and unknown deliveries remain. Held SMS reservations, held refunds, unresolved reconciliation debt and blocked wallets protect related payloads. The routine never deletes delivery rows, immutable financial ledgers, refunds, financial evidence, consent records, suppression records or webhook deduplication receipts. Broader deletion policies require a separately reviewed migration; this is deliberate, not a claim that all retained records can remain forever.

## Encrypted backups and recovery

Use a reviewed PostgreSQL `pg_dump`/`pg_restore` toolchain compatible with the server major version. `PG_BIN_DIR` identifies its binary directory. Set `DATABASE_URL` through the secret store and `BACKUP_ENCRYPTION_KEY` to base64-encoded **32 random bytes**. Keep the key separately from encrypted backups and test key recovery. For remote connections, JavaScript checks require verified TLS (`DATABASE_CA_CERT` may supply PEM); libpq tools require verified TLS too and use `PGSSLROOTCERT` for the approved CA file. URL flags cannot downgrade remote TLS verification.

Connection URLs accept only `application_name` and the legacy SSL keys that the parser removes in favour of explicit trusted configuration. Routing/query overrides such as `host`, `port`, `user` and `ssl=0`, fragments and unrecognized options are rejected. The command-line utilities also remove inherited `PGHOSTADDR`, `PGSERVICE` and `PGSERVICEFILE`, so these cannot redirect a backup/restore after `--expect-target` has been checked. Loopback connections have explicit TLS settings rather than inheriting `PGSSLMODE`. The same strict parser now protects application database clients and migration/operator commands.

```sh
node scripts/ops-backup.mjs --expect-target HOST:PORT/DATABASE --output /protected/path/revision.jipbackup
```

The backup uses `pg_dump --format=custom`, streams directly into AES-256-GCM encryption with a fresh random IV, and records a SHA-256 sidecar manifest. Existing files are never overwritten. Credentials are passed through process environment, never command arguments or normal logs. Backups include this database's schema/data but **not** cluster roles or provider/project settings. A successful backup is not a verified restoration. Set protected file ACLs on Windows; POSIX mode 0600 alone is not a Windows ACL policy. Upload/enforce lifecycle on approved encrypted storage outside this repository; this tooling does not provision backup storage, key escrow or point-in-time recovery.

Restore only trusted artifacts into an **empty, isolated, distinct** database. Restrict its network access and keep all workers off. Pre-provision reviewed roles (`authenticated`, `anon`, `service_role` with the intended BYPASSRLS capability); use the provider's documented project restoration process for managed Supabase identity/storage configuration rather than assuming a logical dump recreates a hosted project.

```sh
# RESTORE_DATABASE_URL is distinct from DATABASE_URL; key matches the backup.
node scripts/ops-restore.mjs --apply --confirm-empty --expect-target HOST:PORT/RECOVERY_DATABASE --input /protected/path/revision.jipbackup
```

Remote restores additionally require `ALLOW_REMOTE_RESTORE=true` and existing authorization for that exact recovery target. The script checks the source/target identity, backup hash, format and GCM authentication before any SQL runs. It refuses non-empty databases and has no overwrite/clean mode. Verified decrypted bytes temporarily occupy a private temporary file for `pg_restore`; its host directory ACLs must be protected. The file is removed afterward. Restore runs in one transaction with a bounded utility timeout and preserves role grants. Required schema checks then run; verify balances/ledger, RLS, application behavior and provider reconciliation before promotion. Recover external changes since the snapshot without blindly retrying uncertain sends/payments. A dump from an untrusted source can execute malicious SQL; encryption does not make an untrusted source trustworthy.

## Official references

- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html): consistent logical dumps and globals limitations.
- [PostgreSQL 17 pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html): restore options and trusted dump requirements.
- [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore): managed project recovery and configuration that logical dumps do not recreate automatically.
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting): reverse proxy, standalone runtime and deployment considerations.
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/): image pinning, build context and runtime privileges.
