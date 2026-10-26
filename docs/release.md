# Release and maintenance

This repository is published as a portfolio project. GitHub Actions verifies code; it does not deploy, register domains, apply migrations to a hosted database, or activate paid providers. Local preview needs no credentials. See [testing](testing.md) for reproducible checks and [verification](verification.md) for observed results.

## Public source releases

1. Review the exact diff, source/asset licences and all environment examples. Keep personal data, original vendor archives, database dumps, credentials and local reports out of Git and build artifacts.
2. Run formatting, lint, types, logic/API tests, production builds and browser tests. Use the separate live-mode build and disposable PostgreSQL/HTTP checks documented in [testing](testing.md).
3. Run dependency and secret scans. Inspect new findings rather than hiding them with broad exclusions.
4. Verify hosted CI for the exact commit. Record mocked identities/providers separately from real PostgreSQL/HTTP execution.
5. Publish documentation and screenshots that match that revision. A passing workflow is evidence for its checks, not certification of security or external services.

## Optional deployment of your fork

These steps belong to the operator of a separate installation, not the portfolio publication:

1. Choose your host, public/member origins and policies. Configure your own operator name, public support contact and mailing address. Keep capabilities disabled until verified.
2. Provision isolated Supabase staging. Review migrations, back up existing data and prove recovery before applying them. Keep the private `app` schema out of the public Data API. Verify two-user isolation and restricted runtime privileges using [operations](operations.md).
3. Configure Auth SMTP and email-code templates. Test signup, sign-in, expiry, logout, session recovery and account deletion. Provision operator roles explicitly, then verify MFA and finance authorization using [operator guidance](operator-guide.md).
4. Configure providers independently with your own test credentials. Verify webhook signatures, consent/withdrawal, delivery status, checkout funding, refunds, duplicate callbacks and uncertain results. See [provider setup](provider-setup.md) and [financial operations](financial-operations.md). Never treat a redirect as payment proof or provider acceptance as recipient delivery.
5. Supply the intended environment to `pnpm release:preflight`. The script does not load Next environment files or verify credentials, DNS, SMTP, sender approval, legal requirements, backups or hosted CI.
6. Deploy the tested revision using an authorized process. [Render examples](render-deployment.md) are optional; container/proxy artifacts also require their own runtime checks. Configure HTTPS, host-controlled forwarding headers, protected secrets, bounded scheduling, monitoring and backups.
7. Exercise real journeys on the target with controlled accounts and recipients. Distinguish sandbox payments from production transactions. Record the revision, URLs, migration hashes and actual results; enable each capability only after its checks pass.
8. Enable public indexing deliberately. The member app always remains noindex, and authorization still provides access control.

## Recovery and ongoing maintenance

Preserve a compatible previous artifact and migration history. Pause new outbound operations during incidents as appropriate, while continuing callbacks and consent withdrawal. A rollback cannot recall messages or reverse payments. Reconcile provider state before restoring a database snapshot.

Review source-rights expiry, retention, provider budgets, old holds, refund/dispute queues and recovery regularly. Keep dependency lockfiles and action pins current through reviewed updates. Test authentication, consent, ledger, scheduling and authorization changes across layers. A full corpus import and a fully reviewed lesson catalogue are different deliverables; no imported corpus or automatic unreviewed publication is supplied.
