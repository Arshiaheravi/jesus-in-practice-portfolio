import type { Database, SqlExecutor } from "./database.ts";
import { RepositoryError } from "./repository.ts";

export type OperatorRole = "admin" | "support" | "editor";
export const operatorRoles: OperatorRole[] = ["admin", "support", "editor"];

export async function assertOperator(
  sql: SqlExecutor,
  actorId: string,
  allowed: OperatorRole[] = operatorRoles,
): Promise<OperatorRole> {
  const row = (
    await sql.query<{ role: OperatorRole }>(
      "select role from app.operator_roles where user_id=$1 and active=true",
      [actorId],
    )
  ).rows[0];
  if (!row || !allowed.includes(row.role))
    throw new RepositoryError("operator_required", "Operator access required");
  return row.role;
}

export async function recordOperatorAudit(
  sql: SqlExecutor,
  input: {
    actorId: string;
    role: OperatorRole;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    details?: Record<string, unknown>;
  },
) {
  if (input.reason.trim().length < 10 || input.reason.length > 500)
    throw new RepositoryError("invalid_reason", "Provide a specific reason");
  await sql.query(
    "insert into app.operator_audit(actor_id,actor_role,action,target_type,target_id,reason,details) values($1,$2,$3,$4,$5,$6,$7)",
    [
      input.actorId,
      input.role,
      input.action,
      input.targetType,
      input.targetId,
      input.reason.trim(),
      JSON.stringify(input.details ?? {}),
    ],
  );
}

export class OperatorRepository {
  private readonly database: Database;
  constructor(database: Database) {
    this.database = database;
  }
  role(actorId: string, allowed: OperatorRole[] = operatorRoles) {
    return this.database.withService((sql) => assertOperator(sql, actorId, allowed));
  }
  /** Bounded exception queues; no destinations or private reflections are exposed. */
  cases(actorId: string, cursor?: string) {
    let before: { date: string; id: string } | null = null;
    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (
          typeof parsed.date !== "string" ||
          !Number.isFinite(Date.parse(parsed.date)) ||
          typeof parsed.id !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(parsed.id)
        )
          throw new Error();
        before = parsed;
      } catch {
        throw new RepositoryError("invalid_cursor", "Invalid page cursor");
      }
    }
    return this.database.withService(async (sql) => {
      await assertOperator(sql, actorId, ["admin", "support"]);
      const events = await sql.query<{
        id: string;
        walletId: string | null;
        kind: string;
        amountCents: number;
        createdAt: string;
        paymentIntentId: string;
      }>(
        `select f.id,f.wallet_id as "walletId",f.kind,f.amount_cents as "amountCents",f.created_at::text as "createdAt",f.payment_intent_id as "paymentIntentId" from app.financial_events f
         where ($1::timestamptz is null or (f.created_at,f.id) < ($1::timestamptz,$2::uuid)) order by f.created_at desc,f.id desc limit 51`,
        [before?.date ?? null, before?.id ?? null],
      );
      const deliveries = await sql.query<{
        id: string;
        channel: string;
        status: string;
        failureCode: string | null;
        providerId: string | null;
        creditState: string | null;
        amountCents: number | null;
        updatedAt: string;
      }>(
        `select d.id,d.channel,d.status,d.failure_code as "failureCode",d.provider_id as "providerId",d.updated_at::text as "updatedAt",r.status as "creditState",r.amount_cents as "amountCents" from app.deliveries d left join app.credit_reservations r on r.delivery_id=d.id where d.status in ('unknown','sending') and r.status is distinct from 'waived' order by d.updated_at,d.id limit 50`,
      );
      return {
        events: events.rows.slice(0, 50),
        nextCursor:
          events.rows.length > 50
            ? Buffer.from(
                JSON.stringify({ date: events.rows[49].createdAt, id: events.rows[49].id }),
              ).toString("base64url")
            : null,
        deliveries: deliveries.rows,
        deliveryLimit: 50,
      };
    });
  }
  wallet(actorId: string, walletId: string) {
    return this.database.withService(async (sql) => {
      const role = await assertOperator(sql, actorId, ["admin", "support"]);
      const wallet = (
        await sql.query<{
          id: string;
          availableCents: number;
          reservedCents: number;
          blockedReason: string | null;
        }>(
          'select id,available_cents as "availableCents",reserved_cents as "reservedCents",blocked_reason as "blockedReason" from app.wallets where id=$1',
          [walletId],
        )
      ).rows[0];
      if (!wallet) throw new RepositoryError("not_found", "Wallet not found");
      const checkouts = await sql.query<{
        id: string;
        amountCents: number;
        status: string;
        createdAt: string;
      }>(
        'select id,amount_cents as "amountCents",status,created_at::text as "createdAt" from app.checkout_intents where wallet_id=$1 order by created_at desc,id desc limit 100',
        [walletId],
      );
      const refunds = await sql.query<{
        id: string;
        checkoutId: string;
        amountCents: number;
        status: string;
        holdState: string;
        createdAt: string;
      }>(
        'select id,checkout_id as "checkoutId",amount_cents as "amountCents",status,hold_state as "holdState",created_at::text as "createdAt" from app.refund_operations where wallet_id=$1 order by created_at desc,id desc limit 100',
        [walletId],
      );
      await recordOperatorAudit(sql, {
        actorId,
        role,
        action: "wallet.inspect",
        targetType: "wallet",
        targetId: walletId,
        reason: "Operator inspected financial support records.",
      });
      return { wallet, checkouts: checkouts.rows, refunds: refunds.rows, limit: 100 };
    });
  }
}
