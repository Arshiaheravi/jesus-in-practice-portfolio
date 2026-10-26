# Operator workspace

The member app has a separate `/operator` workspace. Every API verifies a current Supabase user, verified token claims, a current database role, and MFA. User email and editable profile metadata never grant operator authority. The workspace has no preview administrator or production authentication bypass.

## First operator

1. Configure the real Supabase project, OTP email and database migrations through [provider setup](provider-setup.md). Sign up using the normal email flow and copy the confirmed user's Auth UUID from the controlled Supabase console.
2. From a trusted administrative terminal, load the intended database-owner connection through an environment file or secret store. Review the role command without `--apply` first:

   ```powershell
   npx.cmd --yes pnpm@10.26.0 exec node --experimental-strip-types --env-file=apps/dashboard/.env.local packages/backend/scripts/operator-access.mjs --user CONFIRMED_USER_UUID --actor CONFIRMED_USER_UUID --role admin --reason "Initial owner access for production operations"
   # Repeat the same reviewed command with --apply to commit the role and audit record.
   ```

3. Open the live member origin at `/operator/access`. Set up an authenticator and enter its current six-digit code. Setup secrets are returned only to that operator's no-store session and are never saved in browser storage by the application.
4. Financial actions require a TOTP verification within 15 minutes. Reverify on the authenticator screen when asked. Role revocation is checked on the next API request and again in each privileged database operation; an already-authorized transaction is not retroactively cancelled.

The application service role can read operator assignments but cannot grant or change them. Role changes require the database-owner CLI and an audit reason. `--revoke` disables the supplied operator UUID. Do not share administrator accounts. Device-loss recovery requires the Supabase account owner to verify the person and recover factors through the provider's controlled administration process; there is no public factor-reset route.

| Role      | Access                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| `admin`   | Service checks, financial review/refunds/waivers, content review             |
| `support` | Service checks and bounded financial records; no balance-changing actions    |
| `editor`  | Service checks and content drafting/review/publication; no financial records |

## Financial support

Members can copy their wallet support ID from `/wallet`. Inspect that ID to see available/reserved credit, current restriction, recent paid top-ups and recorded refund requests. The interface labels its 100-record wallet history limit; the payment event queue uses cursor pagination. Operator views exclude private reflections and cleartext contact destinations.

- A refund request reserves exactly the chosen unused credit and records a stable request UUID. Maintenance submits it to Stripe after the database transaction commits. A recorded/accepted request is not a completed refund.
- A timeout retains the request UUID. Retry the same request or use **Recover a refund request**. The wallet's refund history survives browser refresh and MFA navigation. Do not create another request merely because the first response was delayed.
- Definitive validation/authorization/conflict rejection permits correcting the form. A recorded refund remains recoverable by ID. Cancellation releases only a never-submitted request or one proven absent by complete provider evidence after the safety interval.
- Incident reconciliation derives its adjustment from complete provider refund/dispute history. It cannot force a wallet open or apply an arbitrary balance. Pending evidence or uncovered losses keep the restriction. A late refund failure after account deletion creates a visible restricted financial incident.
- A held **unknown SMS** may be explicitly waived by an administrator under the approved commerce policy. The service absorbs any provider cost. The exact reservation is restored once; the delivery stays unknown, is never resent, and a late callback cannot charge the waived credit again. Other unresolved obligations still block account deletion.

All financial actions need current administrator authorization, recent MFA, a specific reason and explicit confirmation. Use case identifiers in notes; never copy card data or private reflections into audit reasons. See [financial operations](financial-operations.md).

## Content review

Use the [content CLI](content-pipeline.md) to validate/register an edition manifest, record real Canadian-use permissions and import the complete checksummed artifact. `CONTENT_RIGHTS_ENABLED` stays false until that work is approved. A KJV text family is required for Bible editions. A manifest alone does not establish licensing or theological accuracy.

The editor selects an imported eligible edition, book and exact verse range. Manual drafts and optionally configured AI drafts create immutable revisions. AI receives selected source text and context, never member addresses or journals. Each version displays its source passage, context, original explanation, example, action, reflection and short SMS text. Review reasons are available with pagination.

Check every review item before approval. Publishing is a separate explicit action. Published versions cannot be rewritten or given a contradictory review; create a revision or withdraw the version instead. Withdrawn, superseded, expired-permission or revoked-source versions are excluded from new selection; queued versions are checked again before sending. Already submitted messages cannot be recalled.

## Monitoring and maintenance

The overview reports configuration/database checks and their timestamp. Refresh for current results. It does not verify external services or certify security. Configure the protected monitoring and scheduler processes, reviewed retention policy, encrypted backup destination, restore drills and alert owner using [production operations](production-operations.md).

Auth implementation references: [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [verified claims](https://supabase.com/docs/reference/javascript/auth-getclaims), [TOTP enrollment and verification](https://supabase.com/docs/guides/auth/auth-mfa/totp). No real Supabase MFA enrollment has been performed in this workspace.
