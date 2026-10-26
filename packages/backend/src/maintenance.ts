import { createHash } from "node:crypto";
import { z } from "zod";

import type { Database, SqlExecutor } from "./database.ts";

const policySchema = z
  .object({
    approvalReference: z.string().trim().min(1).max(200),
    approvedAt: z.iso.datetime(),
    expiredPhoneChallengeDays: z.number().int().min(1).max(3650),
    // Auth/provider quotas can span a full day; never remove an active quota bucket.
    rateLimitDays: z.number().int().min(2).max(3650),
    terminalPayloadDays: z.number().int().min(1).max(36500),
    batchSize: z.number().int().min(1).max(500),
  })
  .strict();
export type RetentionPolicy = z.infer<typeof policySchema>;
export function parseRetentionPolicy(input: unknown): RetentionPolicy {
  const policy = policySchema.parse(input);
  if (Date.parse(policy.approvedAt) > Date.now())
    throw new Error("Retention approval cannot be in the future.");
  return policy;
}
export interface RetentionCounts {
  expiredPhoneChallenges: number;
  oldRateLimits: number;
  terminalPayloads: number;
}
export interface RetentionResult {
  dryRun: boolean;
  busy: boolean;
  policySha256: string;
  counts: RetentionCounts;
  hasMore: boolean;
}

const eligiblePayload = `d.status in ('delivered','failed','cancelled')
  and d.payload_redacted_at is null and d.updated_at < $1
  and not exists(select 1 from app.credit_reservations r where r.delivery_id=d.id and r.status='held')
  and not exists(select 1 from app.wallets w where w.user_id=d.user_id and (
    w.blocked_reason is not null
    or exists(select 1 from app.refund_operations r where r.wallet_id=w.id and r.hold_state='held')
    or exists(select 1 from app.payment_reconciliations p where p.wallet_id=w.id and p.debt_cents>0)
  ))`;

/** Server-only. Call only after operator authorization; there are no default approved periods. */
export async function runRetention(
  database: Database,
  input: RetentionPolicy,
  options: { dryRun: boolean; now?: Date },
): Promise<RetentionResult> {
  const policy = parseRetentionPolicy(input);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid maintenance time.");
  const cutoff = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const policySha256 = createHash("sha256").update(JSON.stringify(policy)).digest("hex");
  const result: RetentionResult = {
    dryRun: options.dryRun,
    busy: false,
    policySha256,
    counts: { expiredPhoneChallenges: 0, oldRateLimits: 0, terminalPayloads: 0 },
    hasMore: false,
  };
  return database.withService(async (sql) => {
    if (!options.dryRun) {
      const lock = await sql.query<{ acquired: boolean }>(
        "select pg_try_advisory_xact_lock(721044327) as acquired",
      );
      if (!lock.rows[0]?.acquired) return { ...result, busy: true };
    }
    const candidates = [
      {
        key: "expiredPhoneChallenges" as const,
        table: "app.phone_challenges",
        id: "user_id",
        query:
          "select user_id from app.phone_challenges where expires_at < $1 order by expires_at,user_id",
        cutoff: cutoff(policy.expiredPhoneChallengeDays),
      },
      {
        key: "oldRateLimits" as const,
        table: "app.rate_limits",
        id: "bucket_key",
        query:
          "select bucket_key from app.rate_limits where window_started_at < $1 order by window_started_at,bucket_key",
        cutoff: cutoff(policy.rateLimitDays),
      },
      {
        key: "terminalPayloads" as const,
        table: "app.deliveries",
        id: "id",
        query: `select d.id from app.deliveries d join app.wallets owner_wallet on owner_wallet.user_id=d.user_id where ${eligiblePayload} order by d.updated_at,d.id`,
        cutoff: cutoff(policy.terminalPayloadDays),
      },
    ];
    for (const candidate of candidates) {
      // Closed table/column names above; all policy values remain SQL parameters.
      const selected = await sql.query(
        `${candidate.query} limit $2${options.dryRun ? "" : candidate.key === "terminalPayloads" ? " for update of d,owner_wallet skip locked" : " for update skip locked"}`,
        [candidate.cutoff, policy.batchSize + 1],
      );
      result.hasMore ||= selected.rows.length > policy.batchSize;
      let ids = selected.rows.slice(0, policy.batchSize).map((row) => row[candidate.id]);
      if (!options.dryRun && candidate.key === "terminalPayloads" && ids.length) {
        // Recheck on a fresh READ COMMITTED snapshot after wallet locks: a refund may have
        // committed between the selection snapshot and lock acquisition.
        const eligible = await sql.query(
          `select d.id from app.deliveries d where ${eligiblePayload} and d.id=any($2::uuid[])`,
          [candidate.cutoff, ids],
        );
        ids = eligible.rows.map((row) => row.id);
      }
      result.counts[candidate.key] = ids.length;
      if (options.dryRun || !ids.length) continue;
      if (candidate.key === "terminalPayloads") {
        // Keep non-PII pricing/date evidence and every idempotency identity. Never delete a delivery.
        await sql.query(
          `update app.deliveries set payload=jsonb_strip_nulls(jsonb_build_object(
          'localDate',payload->'localDate','quoteCents',payload->'quoteCents',
          'rateCents',payload->'rateCents','segments',payload->'segments')),
          payload_redacted_at=$2 where id=any($1::uuid[])`,
          [ids, now],
        );
      } else {
        await sql.query(
          `delete from ${candidate.table} where ${candidate.id}=any($1::${candidate.id === "user_id" ? "uuid" : "text"}[])`,
          [ids],
        );
      }
    }
    if (!options.dryRun)
      await sql.query(
        "insert into app.maintenance_runs(policy_sha256,approval_reference,counts) values($1,$2,$3::jsonb)",
        [policySha256, policy.approvalReference, JSON.stringify(result.counts)],
      );
    return result;
  });
}

export interface ReadinessCheck {
  code: string;
  status: "pass" | "warn" | "fail";
  count?: number;
  ageSeconds?: number | null;
}
export interface ReadinessOptions {
  expectedMigrations: readonly { name: string; sha256?: string }[];
  configuration: Readonly<Record<string, boolean>>;
  deliveryEnabled: boolean;
  retentionRequired: boolean;
  thresholds?: {
    plannerSeconds?: number;
    queueSeconds?: number;
    webhookSeconds?: number;
    unknownSeconds?: number;
    maintenanceSeconds?: number;
  };
  now?: Date;
}
export interface ReadinessResult {
  ready: boolean;
  checkedAt: string;
  scope: "database-and-configuration";
  externalServicesVerified: false;
  checks: ReadinessCheck[];
}
const safeThreshold = (value: number | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 31_536_000)
    throw new Error("Invalid readiness threshold.");
  return value;
};

/** Aggregate operational diagnostics only. The HTTP caller MUST authenticate with an operations secret. */
export async function inspectReadiness(
  database: Database,
  options: ReadinessOptions,
): Promise<ReadinessResult> {
  const now = options.now ?? new Date();
  const checks: ReadinessCheck[] = Object.entries(options.configuration).map(([code, ready]) => ({
    code: `config:${code}`,
    status: ready ? "pass" : "fail",
  }));
  const thresholds = {
    planner: safeThreshold(options.thresholds?.plannerSeconds, 180),
    queue: safeThreshold(options.thresholds?.queueSeconds, 600),
    webhook: safeThreshold(options.thresholds?.webhookSeconds, 600),
    unknown: safeThreshold(options.thresholds?.unknownSeconds, 900),
    maintenance: safeThreshold(options.thresholds?.maintenanceSeconds, 172800),
  };
  try {
    await database.withService(async (sql) => {
      await sql.query("select 1");
      checks.push({ code: "database", status: "pass" });
      const schema = await sql.query<{ exists: boolean }>(
        "select to_regclass('app.schema_migrations') is not null as exists",
      );
      if (!schema.rows[0]?.exists) {
        checks.push({ code: "migrations", status: "fail" });
        return;
      }
      const applied = await sql.query<{ name: string; sha256: string }>(
        "select name,sha256 from app.schema_migrations",
      );
      const missing = options.expectedMigrations.filter(
        (expected) =>
          !applied.rows.some(
            (row) =>
              row.name === expected.name && (!expected.sha256 || row.sha256 === expected.sha256),
          ),
      );
      checks.push({
        code: "migrations",
        status: missing.length || !options.expectedMigrations.length ? "fail" : "pass",
        count: missing.length,
      });
      if (missing.length) return;
      const unsafe = await sql.query<{
        count: string;
      }>(`select count(*) as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app' and c.relkind='r' and c.relname<>'schema_migrations' and not c.relrowsecurity`);
      checks.push({
        code: "row_security",
        status: Number(unsafe.rows[0]?.count) ? "fail" : "pass",
        count: Number(unsafe.rows[0]?.count),
      });
      const grants = await sql.query<{
        count: string;
      }>(`select count(*) as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app' and c.relkind='r' and c.relname not in ('profiles','saved_practices','completions','notes')
        and has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')`);
      checks.push({
        code: "member_privileged_writes",
        status: Number(grants.rows[0]?.count) ? "fail" : "pass",
        count: Number(grants.rows[0]?.count),
      });
      const aged = async (
        code: string,
        query: string,
        seconds: number,
        status: "warn" | "fail",
      ) => {
        const value = await sql.query<{ count: string }>(query, [
          new Date(now.getTime() - seconds * 1000),
        ]);
        const count = Number(value.rows[0]?.count ?? 0);
        checks.push({ code, status: count ? status : "pass", count });
      };
      await aged(
        "unprocessed_webhooks",
        "select count(*) as count from app.webhook_receipts where status='received' and received_at<$1",
        thresholds.webhook,
        "fail",
      );
      await aged(
        "old_unknown_deliveries",
        "select count(*) as count from app.deliveries where status='unknown' and updated_at<$1",
        thresholds.unknown,
        "warn",
      );
      if (options.deliveryEnabled) {
        await aged(
          "queue_lag",
          "select count(*) as count from app.deliveries where status in ('queued','claimed') and scheduled_at<$1",
          thresholds.queue,
          "fail",
        );
        await timestampCheck(
          sql,
          checks,
          "planner_freshness",
          "select max(updated_at) as latest from app.job_cursors where job_name='plan-deliveries'",
          now,
          thresholds.planner,
        );
      }
      if (options.retentionRequired)
        await timestampCheck(
          sql,
          checks,
          "retention_freshness",
          "select max(completed_at) as latest from app.maintenance_runs",
          now,
          thresholds.maintenance,
        );
      const blocked = await sql.query<{ count: string }>(
        "select count(*) as count from app.wallets where blocked_reason is not null",
      );
      checks.push({
        code: "blocked_wallets",
        status: Number(blocked.rows[0]?.count) ? "warn" : "pass",
        count: Number(blocked.rows[0]?.count),
      });
    });
  } catch {
    // Do not emit connection strings, SQL errors, account IDs or provider data.
    checks.push({ code: "database_inspection", status: "fail" });
  }
  return {
    ready: !checks.some((check) => check.status === "fail"),
    checkedAt: now.toISOString(),
    scope: "database-and-configuration",
    externalServicesVerified: false,
    checks,
  };
}

async function timestampCheck(
  sql: SqlExecutor,
  checks: ReadinessCheck[],
  code: string,
  query: string,
  now: Date,
  maxAge: number,
) {
  const value = await sql.query<{ latest: Date | string | null }>(query);
  const latest = value.rows[0]?.latest;
  const ageSeconds = latest
    ? Math.max(0, Math.floor((now.getTime() - new Date(latest).getTime()) / 1000))
    : null;
  checks.push({
    code,
    status: ageSeconds === null || ageSeconds > maxAge ? "fail" : "pass",
    ageSeconds,
  });
}
