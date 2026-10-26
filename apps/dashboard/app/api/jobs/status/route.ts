import { constantEqual } from "@jesus-in-practice/backend/tokens";

import { secret, ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { database } from "@/lib/server/runtime";

export const GET = route(async (request) => {
  if (!constantEqual(request.headers.get("authorization") ?? "", `Bearer ${secret("CRON_SECRET")}`))
    throw new ServiceError("FORBIDDEN", "Request not authorized.", 403);
  const status = await database().withService(async (sql) => ({
    deliveries: (
      await sql.query(
        "select channel,status,count(*)::integer as count,min(created_at) as oldest from app.deliveries group by channel,status",
      )
    ).rows,
    blockedWallets: Number(
      (
        await sql.query(
          "select count(*) as count from app.wallets where blocked_reason is not null",
        )
      ).rows[0].count,
    ),
    pendingWebhooks: Number(
      (
        await sql.query(
          "select count(*) as count from app.webhook_receipts where status='received' and received_at<now()-interval '10 minutes'",
        )
      ).rows[0].count,
    ),
    planner:
      (
        await sql.query(
          "select updated_at,cursor is not null as pending from app.job_cursors where job_name='plan-deliveries'",
        )
      ).rows[0] ?? null,
  }));
  return json({ checkedAt: new Date().toISOString(), ...status });
});
