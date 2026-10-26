import "server-only";

import { randomUUID } from "node:crypto";

import { FinancialOperations } from "@jesus-in-practice/backend/financial-operations";
import {
  inspectReadiness,
  parseRetentionPolicy,
  runRetention,
} from "@jesus-in-practice/backend/maintenance";

import {
  checkoutEnabled,
  operatorConfigured,
  phoneVerificationEnabled,
  sendingEnabled,
} from "./config";
import { stripe } from "./providers";
import { database, repository } from "./runtime";

const expectedMigrations = [
  "202610170001_backend.sql",
  "202610170002_worker_leases.sql",
  "202610170003_reconciliation.sql",
  "202610170004_operators.sql",
  "202610170005_financial_operations.sql",
  "202610170006_content_editorial.sql",
  "202610170007_operations.sql",
  "202610170008_delivery_support.sql",
  "202610200009_migration_history_privileges.sql",
].map((name) => ({ name }));
export function retentionPolicy() {
  return parseRetentionPolicy(JSON.parse(process.env.RETENTION_POLICY_JSON ?? "null"));
}
export function serviceReadiness() {
  let retention = false;
  try {
    retentionPolicy();
    retention = process.env.ENABLE_RETENTION === "true";
  } catch {
    /* Missing policy remains an explicit failed check. */
  }
  return inspectReadiness(database(), {
    expectedMigrations,
    configuration: {
      operatorIdentity: operatorConfigured(),
      monitoringSecret: (process.env.MONITORING_SECRET?.trim().length ?? 0) >= 32,
      retentionPolicy: retention,
      emailConfiguration: process.env.ENABLE_EMAIL_DELIVERY !== "true" || sendingEnabled("email"),
      smsConfiguration: process.env.ENABLE_SMS_DELIVERY !== "true" || sendingEnabled("sms"),
      phoneVerificationConfiguration:
        process.env.ENABLE_PHONE_VERIFICATION !== "true" || phoneVerificationEnabled(),
      paymentConfiguration: process.env.ENABLE_PAYMENTS !== "true" || checkoutEnabled(),
    },
    deliveryEnabled: sendingEnabled("email") || sendingEnabled("sms"),
    retentionRequired: retention,
  });
}
export async function runMaintenance() {
  const token = randomUUID();
  const acquired = await database().withService(
    async (sql) =>
      (
        await sql.query(
          "insert into app.worker_leases(name,token,expires_at) values('maintenance',$1,now()+interval '90 seconds') on conflict(name) do update set token=excluded.token,expires_at=excluded.expires_at where app.worker_leases.expires_at<now() returning name",
          [token],
        )
      ).rows.length > 0,
  );
  if (!acquired) return { busy: true };
  try {
    let finance: { refunds: unknown; checkouts: unknown } | null = null;
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
      const operations = new FinancialOperations(repository(), stripe(5_000));
      finance = {
        refunds: await operations.reconcileRefunds(1),
        checkouts: await operations.reconcileCheckouts({ limit: 1, maxPages: 1 }),
      };
    }
    const retention =
      process.env.ENABLE_RETENTION === "true"
        ? await runRetention(database(), retentionPolicy(), { dryRun: false })
        : null;
    await repository().setJobCursor("maintenance", null);
    return { busy: false, finance, retention };
  } finally {
    await database().withService((sql) =>
      sql.query("delete from app.worker_leases where name='maintenance' and token=$1", [token]),
    );
  }
}
