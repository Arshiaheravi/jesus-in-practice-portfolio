import { createHash, randomUUID } from "node:crypto";
import type { SqlExecutor } from "./database.ts";
import { assertOperator, recordOperatorAudit } from "./operators.ts";
import { BackendRepository, RepositoryError } from "./repository.ts";
import type { createStripeProvider, RefundEvidence } from "./providers/stripe.ts";

type FinancialProvider = Pick<
  ReturnType<typeof createStripeProvider>,
  | "createRefund"
  | "retrieveRefund"
  | "financialEvidence"
  | "listFundingSessions"
  | "retrieveFunding"
>;
export interface RefundRecord {
  id: string;
  walletId: string;
  checkoutId: string;
  paymentIntentId: string;
  amountCents: number;
  actorId: string;
  reason: string;
  status: string;
  holdState: "held" | "settled" | "released";
  providerRefundId: string | null;
  attemptedAt: Date | null;
  createdAt: Date;
  leaseUntil: Date | null;
}
export interface ResolutionRecord {
  operationId: string;
  paymentIntentId: string;
  actorId: string;
  reason: string;
  adjustmentCents: number;
  debtCents: number;
  result: "pending" | "resolved";
}
const refundColumns = `id,wallet_id as "walletId",checkout_id as "checkoutId",payment_intent_id as "paymentIntentId",amount_cents as "amountCents",actor_id as "actorId",reason,status,hold_state as "holdState",provider_refund_id as "providerRefundId",attempted_at as "attemptedAt",created_at as "createdAt",lease_until as "leaseUntil"`;
const resolutionColumns = `operation_id as "operationId",payment_intent_id as "paymentIntentId",actor_id as "actorId",reason,adjustment_cents as "adjustmentCents",debt_cents as "debtCents",result`;
function uuid(value: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    throw new RepositoryError("invalid_operation", "A valid operation identifier is required");
}
function reason(value: string) {
  if (value.trim().length < 10 || value.length > 500)
    throw new RepositoryError(
      "invalid_reason",
      "Provide an audit reason between 10 and 500 characters",
    );
}
function amount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RepositoryError("invalid_amount", "Use positive integer CAD cents");
}
async function paymentLock(sql: SqlExecutor, paymentIntentId: string) {
  await sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `payment:${paymentIntentId}`,
  ]);
}
async function ledger(
  sql: SqlExecutor,
  walletId: string,
  kind: string,
  cents: number,
  available: number,
  reserved: number,
  key: string,
) {
  await sql.query(
    "insert into app.credit_ledger(wallet_id,kind,amount_cents,available_delta,reserved_delta,idempotency_key) values($1,$2,$3,$4,$5,$6)",
    [walletId, kind, cents, available, reserved, key],
  );
}

/** Server-only capability. Operator routes must additionally establish a verified MFA session. */
export class FinancialOperations {
  readonly repo: BackendRepository;
  readonly provider: FinancialProvider;
  constructor(repo: BackendRepository, provider: FinancialProvider) {
    this.repo = repo;
    this.provider = provider;
  }

  getRefund(id: string): Promise<RefundRecord | null> {
    uuid(id);
    return this.repo.database.withService(
      async (sql) =>
        (
          await sql.query<RefundRecord>(
            `select ${refundColumns} from app.refund_operations where id=$1`,
            [id],
          )
        ).rows[0] ?? null,
    );
  }

  async requestRefund(input: {
    operationId: string;
    checkoutId: string;
    amountCents: number;
    actorId: string;
    reason: string;
  }): Promise<RefundRecord> {
    uuid(input.operationId);
    uuid(input.checkoutId);
    uuid(input.actorId);
    amount(input.amountCents);
    reason(input.reason);
    return this.repo.database.withService(async (sql) => {
      const role = await assertOperator(sql, input.actorId, ["admin"]);
      const checkout = (
        await sql.query<{
          wallet_id: string;
          amount_cents: number;
          payment_intent_id: string | null;
          status: string;
        }>(
          "select wallet_id,amount_cents,payment_intent_id,status from app.checkout_intents where id=$1",
          [input.checkoutId],
        )
      ).rows[0];
      if (!checkout?.payment_intent_id || checkout.status !== "paid")
        throw new RepositoryError(
          "refund_unavailable",
          "Only a verified paid purchase can be refunded",
        );
      await paymentLock(sql, checkout.payment_intent_id);
      const wallet = (
        await sql.query<{ available_cents: number; blocked_reason: string | null }>(
          "select available_cents,blocked_reason from app.wallets where id=$1 for update",
          [checkout.wallet_id],
        )
      ).rows[0];
      const existing = (
        await sql.query<RefundRecord>(
          `select ${refundColumns} from app.refund_operations where id=$1`,
          [input.operationId],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.checkoutId !== input.checkoutId ||
          existing.amountCents !== input.amountCents ||
          existing.actorId !== input.actorId ||
          existing.reason !== input.reason
        )
          throw new RepositoryError(
            "operation_conflict",
            "The operation ID has different refund details",
          );
        return existing;
      }
      if (wallet.blocked_reason)
        throw new RepositoryError(
          "wallet_blocked",
          "Resolve the financial incident before refunding",
        );
      const committed = Number(
        (
          await sql.query<{ total: string }>(
            "select coalesce(sum(amount_cents),0) as total from app.refund_operations where checkout_id=$1 and hold_state<>'released'",
            [input.checkoutId],
          )
        ).rows[0].total,
      );
      if (
        committed + input.amountCents > checkout.amount_cents ||
        wallet.available_cents < input.amountCents
      )
        throw new RepositoryError(
          "insufficient_funds",
          "Only unused, unreserved purchase credit can be refunded",
        );
      const refund = (
        await sql.query<RefundRecord>(
          `insert into app.refund_operations(id,wallet_id,checkout_id,payment_intent_id,amount_cents,actor_id,reason) values($1,$2,$3,$4,$5,$6,$7) returning ${refundColumns}`,
          [
            input.operationId,
            checkout.wallet_id,
            input.checkoutId,
            checkout.payment_intent_id,
            input.amountCents,
            input.actorId,
            input.reason,
          ],
        )
      ).rows[0];
      await sql.query(
        "update app.wallets set available_cents=available_cents-$2,reserved_cents=reserved_cents+$2 where id=$1",
        [refund.walletId, refund.amountCents],
      );
      await ledger(
        sql,
        refund.walletId,
        "refund_hold",
        refund.amountCents,
        -refund.amountCents,
        refund.amountCents,
        `refund-hold:${refund.id}`,
      );
      await recordOperatorAudit(sql, {
        actorId: input.actorId,
        role,
        action: "refund.request",
        targetType: "refund",
        targetId: refund.id,
        reason: input.reason,
        details: { checkoutId: input.checkoutId, amountCents: input.amountCents },
      });
      return refund;
    });
  }

  private async withRefund<T>(
    id: string,
    operation: (sql: SqlExecutor, refund: RefundRecord) => Promise<T>,
  ): Promise<T> {
    return this.repo.database.withService(async (sql) => {
      const initial = (
        await sql.query<RefundRecord>(
          `select ${refundColumns} from app.refund_operations where id=$1`,
          [id],
        )
      ).rows[0];
      if (!initial) throw new RepositoryError("not_found", "Refund operation not found");
      await paymentLock(sql, initial.paymentIntentId);
      await sql.query("select id from app.wallets where id=$1 for update", [initial.walletId]);
      const row = (
        await sql.query<RefundRecord>(
          `select ${refundColumns} from app.refund_operations where id=$1 for update`,
          [id],
        )
      ).rows[0];
      return operation(sql, row);
    });
  }

  /** Only provider evidence can finalize a hold; a timeout never releases it. */
  private async applyRefund(id: string, evidence: RefundEvidence): Promise<RefundRecord> {
    return this.withRefund(id, async (sql, row) => {
      if (
        evidence.paymentIntentId !== row.paymentIntentId ||
        evidence.amountCents !== row.amountCents ||
        evidence.currency !== "cad" ||
        evidence.operationId !== row.id ||
        (row.providerRefundId && row.providerRefundId !== evidence.id)
      )
        throw new RepositoryError(
          "refund_mismatch",
          "Refund evidence does not match its operation",
        );
      // Provider evidence arriving after an absence-based cancellation cannot silently spend restored credit.
      if (row.holdState === "released") {
        if (!["failed", "canceled"].includes(evidence.status)) {
          const eventId = `refund-reopened:${evidence.id}`;
          await sql.query(
            "insert into app.financial_events(wallet_id,provider_event_id,payment_intent_id,kind,amount_cents) values($1,$2,$3,'refund',$4) on conflict(provider_event_id) do nothing",
            [row.walletId, eventId, row.paymentIntentId, row.amountCents],
          );
          await sql.query(
            "update app.wallets set blocked_reason='payment_refund_reopened' where id=$1 and exists(select 1 from app.financial_events e left join app.financial_event_resolutions r on r.event_id=e.id where e.provider_event_id=$2 and r.event_id is null)",
            [row.walletId, eventId],
          );
        }
        return row;
      }
      // Refunds may fail after initially succeeding; restore exactly once.
      if (evidence.status === "succeeded" && row.holdState === "held") {
        await sql.query("update app.wallets set reserved_cents=reserved_cents-$2 where id=$1", [
          row.walletId,
          row.amountCents,
        ]);
        await ledger(
          sql,
          row.walletId,
          "refund_settle",
          row.amountCents,
          0,
          -row.amountCents,
          `refund-settle:${id}`,
        );
        await sql.query("update app.refund_operations set hold_state='settled' where id=$1", [id]);
      } else if (["failed", "canceled"].includes(evidence.status)) {
        const held = row.holdState === "held";
        await sql.query(
          "update app.wallets set available_cents=available_cents+$2,reserved_cents=reserved_cents-$3 where id=$1",
          [row.walletId, row.amountCents, held ? row.amountCents : 0],
        );
        await ledger(
          sql,
          row.walletId,
          held ? "refund_release" : "refund_return",
          row.amountCents,
          row.amountCents,
          held ? -row.amountCents : 0,
          `refund-return:${id}`,
        );
        const detached = (
          await sql.query<{ detached: boolean }>(
            "select user_id is null as detached from app.wallets where id=$1",
            [row.walletId],
          )
        ).rows[0].detached;
        if (detached) {
          // The restored credit has no remaining private account. Surface it for provider/customer follow-up.
          const incidentId = `internal:${createHash("sha256")
            .update(
              JSON.stringify(["detached-refund-return", row.id, evidence.id, evidence.status]),
            )
            .digest("hex")}`;
          await sql.query(
            "insert into app.financial_events(wallet_id,provider_event_id,payment_intent_id,kind,amount_cents) values($1,$2,$3,'refund',$4) on conflict(provider_event_id) do nothing",
            [row.walletId, incidentId, row.paymentIntentId, row.amountCents],
          );
          await sql.query(
            "update app.wallets set blocked_reason='payment_refund_returned_after_deletion' where id=$1",
            [row.walletId],
          );
        }
        await sql.query("update app.refund_operations set hold_state='released' where id=$1", [id]);
      } else if (row.holdState === "settled") return row;
      return (
        await sql.query<RefundRecord>(
          `update app.refund_operations set status=$2,provider_refund_id=$3,lease_until=null,next_reconcile_at=now()+interval '10 minutes',updated_at=now() where id=$1 returning ${refundColumns}`,
          [id, evidence.status, evidence.id],
        )
      ).rows[0];
    });
  }

  private async restrictObservedPayment(
    refundId: string,
    evidence: { id: string; kind: "refund" | "dispute"; status: string; amountCents: number },
  ) {
    await this.withRefund(refundId, async (sql, row) => {
      const incidentId = `internal:${createHash("sha256")
        .update(
          JSON.stringify([
            "refund-preflight",
            row.paymentIntentId,
            evidence.kind,
            evidence.id,
            evidence.status,
            evidence.amountCents,
          ]),
        )
        .digest("hex")}`;
      await sql.query(
        "insert into app.financial_events(wallet_id,provider_event_id,payment_intent_id,kind,amount_cents) values($1,$2,$3,$4,$5) on conflict(provider_event_id) do nothing",
        [row.walletId, incidentId, row.paymentIntentId, evidence.kind, evidence.amountCents],
      );
      await sql.query(
        "update app.wallets set blocked_reason=$3 where id=$1 and exists(select 1 from app.financial_events e left join app.financial_event_resolutions r on r.event_id=e.id where e.provider_event_id=$2 and r.event_id is null)",
        [row.walletId, incidentId, `payment_${evidence.kind}`],
      );
    });
  }

  /** Claims one operation. A previously attempted request is discovered, never blindly resubmitted. */
  async processRefund(id: string): Promise<RefundRecord> {
    uuid(id);
    const token = randomUUID();
    const claim = await this.withRefund(id, async (sql, row) => {
      if (
        ["succeeded", "failed", "canceled"].includes(row.status) ||
        (row.leaseUntil && new Date(row.leaseUntil).getTime() > Date.now())
      )
        return { row, claimed: false, create: false };
      await sql.query(
        "update app.refund_operations set lease_token=$2,lease_until=now()+interval '2 minutes',next_reconcile_at=now()+interval '10 minutes' where id=$1",
        [id, token],
      );
      return { row, claimed: true, create: row.status === "requested" && !row.attemptedAt };
    });
    if (!claim.claimed) return claim.row;
    try {
      if (claim.row.providerRefundId)
        return await this.applyRefund(
          id,
          await this.provider.retrieveRefund(claim.row.providerRefundId),
        );
      if (claim.create) {
        const evidence = await this.provider.financialEvidence(claim.row.paymentIntentId);
        let discovered: RefundRecord | null = null;
        for (const refund of evidence.refunds) {
          const local =
            refund.operationId &&
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              refund.operationId,
            )
              ? await this.getRefund(refund.operationId)
              : null;
          if (
            local &&
            local.paymentIntentId === refund.paymentIntentId &&
            local.amountCents === refund.amountCents &&
            refund.currency === "cad" &&
            (!local.providerRefundId || local.providerRefundId === refund.id)
          ) {
            const applied = await this.applyRefund(local.id, refund);
            // Authoritative evidence may discover this operation before its callback arrives.
            if (local.id === id) discovered = applied;
            continue;
          }
          if (["failed", "canceled"].includes(refund.status)) continue;
          // Webhooks can arrive late. An observed external refund must freeze spendable credit
          // before another refund is submitted. Repeated evidence does not reopen a resolved case.
          await this.restrictObservedPayment(id, { ...refund, kind: "refund" });
        }
        for (const dispute of evidence.disputes)
          if (!["won", "warning_closed"].includes(dispute.status))
            await this.restrictObservedPayment(id, { ...dispute, kind: "dispute" });
        if (discovered) return discovered;
        if (!evidence.complete)
          throw new RepositoryError(
            "reconciliation_required",
            "Complete payment history is required before submitting a refund",
          );
        const maySubmit = await this.withRefund(id, async (sql, row) => {
          if (row.holdState !== "held" || row.attemptedAt) return false;
          const wallet = (
            await sql.query<{ blocked_reason: string | null }>(
              "select blocked_reason from app.wallets where id=$1",
              [row.walletId],
            )
          ).rows[0];
          if (wallet.blocked_reason) return false;
          return (
            (
              await sql.query(
                "update app.refund_operations set status='submitting',attempted_at=now() where id=$1 and lease_token=$2 and lease_until>now() returning id",
                [id, token],
              )
            ).rows.length === 1
          );
        });
        if (!maySubmit)
          throw new RepositoryError(
            "refund_pending",
            "The refund cannot be submitted in its current state",
          );
        const result = await this.provider.createRefund({
          operationId: id,
          paymentIntentId: claim.row.paymentIntentId,
          amountCents: claim.row.amountCents,
        });
        if (result.outcome === "accepted") return await this.applyRefund(id, result.refund);
        // A definitive HTTP rejection proves this submission did not create a refund.
        if (result.outcome === "rejected") return await this.releaseRejectedRefund(id, result.code);
      } else {
        const evidence = await this.provider.financialEvidence(claim.row.paymentIntentId);
        const matches = evidence.refunds.filter((refund) => refund.operationId === id);
        if (evidence.complete && matches.length === 1)
          return await this.applyRefund(id, matches[0]);
        if (matches.length > 1)
          throw new RepositoryError(
            "reconciliation_required",
            "Multiple provider refunds require review",
          );
      }
    } catch {
      // Preserve both the durable operation and hold; operational UI can reconcile without retrying a charge/refund.
    }
    return this.withRefund(
      id,
      async (sql, row) =>
        (
          await sql.query<RefundRecord>(
            `update app.refund_operations set status=case when attempted_at is null then 'requested' else 'unknown' end,lease_until=null,lease_token=null,failure_code='provider_outcome_unresolved',updated_at=now() where id=$1 and hold_state='held' and lease_token=$2 returning ${refundColumns}`,
            [id, token],
          )
        ).rows[0] ?? row,
    );
  }

  /** An admin may release a never-submitted request, or an old unknown request proven absent. */
  async cancelAbsentRefund(input: {
    refundId: string;
    actorId: string;
    reason: string;
  }): Promise<RefundRecord> {
    uuid(input.refundId);
    uuid(input.actorId);
    reason(input.reason);
    await this.repo.database.withService((sql) => assertOperator(sql, input.actorId, ["admin"]));
    const initial = await this.getRefund(input.refundId);
    if (!initial) throw new RepositoryError("not_found", "Refund operation not found");
    if (initial.holdState === "released") return initial;
    if (
      initial.providerRefundId ||
      (initial.attemptedAt && Date.now() - new Date(initial.attemptedAt).getTime() < 26 * 3_600_000)
    )
      throw new RepositoryError(
        "refund_pending",
        "Provider outcome is still pending; the refund hold remains",
      );
    if (initial.attemptedAt) {
      const evidence = await this.provider.financialEvidence(initial.paymentIntentId);
      if (!evidence.complete || evidence.refunds.some((row) => row.operationId === initial.id))
        throw new RepositoryError(
          "refund_pending",
          "Provider absence could not be established; the refund hold remains",
        );
    }
    return this.withRefund(initial.id, async (sql, row) => {
      const role = await assertOperator(sql, input.actorId, ["admin"]);
      if (row.holdState === "released") return row;
      if (
        row.holdState !== "held" ||
        row.providerRefundId ||
        (row.leaseUntil && new Date(row.leaseUntil).getTime() > Date.now()) ||
        (row.attemptedAt &&
          (!initial.attemptedAt ||
            new Date(row.attemptedAt).getTime() !== new Date(initial.attemptedAt).getTime()))
      )
        throw new RepositoryError("refund_pending", "Refund state changed; reconcile again");
      await sql.query(
        "update app.wallets set available_cents=available_cents+$2,reserved_cents=reserved_cents-$2 where id=$1",
        [row.walletId, row.amountCents],
      );
      await ledger(
        sql,
        row.walletId,
        "refund_release",
        row.amountCents,
        row.amountCents,
        -row.amountCents,
        `refund-return:${row.id}`,
      );
      await recordOperatorAudit(sql, {
        actorId: input.actorId,
        role,
        action: "refund.cancel_absent",
        targetType: "refund",
        targetId: row.id,
        reason: input.reason,
        details: { providerAbsenceVerified: !!initial.attemptedAt },
      });
      return (
        await sql.query<RefundRecord>(
          `update app.refund_operations set status='canceled',hold_state='released',lease_until=null,lease_token=null,failure_code='provider_absence_verified',updated_at=now() where id=$1 returning ${refundColumns}`,
          [row.id],
        )
      ).rows[0];
    });
  }

  private async releaseRejectedRefund(id: string, code: string) {
    return this.withRefund(id, async (sql, row) => {
      if (row.holdState !== "held" || row.providerRefundId) return row;
      await sql.query(
        "update app.wallets set available_cents=available_cents+$2,reserved_cents=reserved_cents-$2 where id=$1",
        [row.walletId, row.amountCents],
      );
      await ledger(
        sql,
        row.walletId,
        "refund_release",
        row.amountCents,
        row.amountCents,
        -row.amountCents,
        `refund-return:${id}`,
      );
      return (
        await sql.query<RefundRecord>(
          `update app.refund_operations set hold_state='released',status='failed',failure_code=$2,lease_until=null,updated_at=now() where id=$1 returning ${refundColumns}`,
          [id, code],
        )
      ).rows[0];
    });
  }

  /** Call after signature/mode verification; re-read authoritative provider state for out-of-order callbacks. */
  async handleRefundEvent(
    providerRefundId: string,
    eventId: string,
  ): Promise<{ matched: boolean }> {
    const evidence = await this.provider.retrieveRefund(providerRefundId);
    const row = await this.repo.database.withService(
      async (sql) =>
        (
          await sql.query<RefundRecord>(
            `select ${refundColumns} from app.refund_operations where provider_refund_id=$1 or id::text=$2`,
            [providerRefundId, evidence.operationId],
          )
        ).rows[0],
    );
    if (row) {
      await this.applyRefund(row.id, evidence);
      return { matched: true };
    }
    if (evidence.currency === "cad")
      await this.repo.restrictWalletByPaymentIntent({
        paymentIntentId: evidence.paymentIntentId,
        eventId,
        kind: "refund",
        amountCents: evidence.amountCents,
      });
    return { matched: false };
  }

  /** A signed cumulative charge event does not freeze credit already removed by our own refunds. */
  async handleChargeRefundEvent(input: {
    paymentIntentId: string;
    eventId: string;
    amountCents: number;
  }): Promise<{ matched: boolean }> {
    const evidence = await this.provider.financialEvidence(input.paymentIntentId);
    let own =
      evidence.complete &&
      evidence.disputes.every((row) => ["won", "warning_closed"].includes(row.status));
    let total = 0;
    for (const refund of evidence.refunds) {
      const local =
        refund.operationId && /^[a-f0-9-]{36}$/i.test(refund.operationId)
          ? await this.getRefund(refund.operationId)
          : null;
      if (!local) {
        if (!["failed", "canceled"].includes(refund.status)) own = false;
        continue;
      }
      const applied = await this.applyRefund(local.id, refund);
      if (["failed", "canceled"].includes(refund.status)) continue;
      if (applied.holdState !== "settled") own = false;
      if (refund.status !== "succeeded") own = false;
      else total += refund.amountCents;
    }
    if (own && total === input.amountCents && total > 0) return { matched: true };
    await this.repo.restrictWalletByPaymentIntent({ ...input, kind: "refund" });
    return { matched: false };
  }

  /** No balance override: every adjustment is derived from a complete, freshly fetched payment history. */
  async resolveIncident(input: {
    operationId: string;
    paymentIntentId: string;
    actorId: string;
    reason: string;
  }): Promise<ResolutionRecord> {
    uuid(input.operationId);
    uuid(input.actorId);
    reason(input.reason);
    const initial = await this.repo.database.withService(async (sql) => {
      await assertOperator(sql, input.actorId, ["admin"]);
      const existing = (
        await sql.query<ResolutionRecord>(
          `select ${resolutionColumns} from app.financial_resolutions where operation_id=$1`,
          [input.operationId],
        )
      ).rows[0];
      if (
        existing &&
        (existing.actorId !== input.actorId ||
          existing.paymentIntentId !== input.paymentIntentId ||
          existing.reason !== input.reason)
      )
        throw new RepositoryError("operation_conflict", "Resolution ID has different details");
      return {
        existing,
        startedAt: (await sql.query<{ at: Date }>("select clock_timestamp() as at")).rows[0].at,
      };
    });
    if (initial.existing) return initial.existing;
    const evidence = await this.provider.financialEvidence(input.paymentIntentId);
    if (!evidence.complete)
      throw new RepositoryError(
        "reconciliation_incomplete",
        "Provider history is incomplete; the wallet remains frozen",
      );
    for (const refund of evidence.refunds) {
      if (refund.operationId && /^[a-f0-9-]{36}$/i.test(refund.operationId)) {
        const own = await this.getRefund(refund.operationId);
        if (own) await this.applyRefund(own.id, refund);
      }
    }
    return this.repo.database.withService(async (sql) => {
      const role = await assertOperator(sql, input.actorId, ["admin"]);
      await paymentLock(sql, input.paymentIntentId);
      const checkout = (
        await sql.query<{ wallet_id: string; amount_cents: number; status: string }>(
          "select wallet_id,amount_cents,status from app.checkout_intents where payment_intent_id=$1",
          [input.paymentIntentId],
        )
      ).rows[0];
      if (!checkout || checkout.status !== "paid" || checkout.amount_cents !== evidence.amountCents)
        throw new RepositoryError(
          "payment_mismatch",
          "Provider evidence does not match the credited purchase",
        );
      const wallet = (
        await sql.query<{ available_cents: number; blocked_reason: string | null }>(
          "select available_cents,blocked_reason from app.wallets where id=$1 for update",
          [checkout.wallet_id],
        )
      ).rows[0];
      const duplicate = (
        await sql.query<ResolutionRecord>(
          `select ${resolutionColumns} from app.financial_resolutions where operation_id=$1`,
          [input.operationId],
        )
      ).rows[0];
      if (duplicate) {
        if (
          duplicate.actorId !== input.actorId ||
          duplicate.paymentIntentId !== input.paymentIntentId ||
          duplicate.reason !== input.reason
        )
          throw new RepositoryError("operation_conflict", "Resolution ID has different details");
        return duplicate;
      }
      if (
        (
          await sql.query(
            "select id from app.financial_events where payment_intent_id=$1 and created_at>$2 limit 1",
            [input.paymentIntentId, initial.startedAt],
          )
        ).rows.length
      )
        throw new RepositoryError("conflict", "New financial evidence arrived; reconcile again");
      const outstanding =
        evidence.refunds.some((row) => ["pending", "requires_action"].includes(row.status)) ||
        evidence.disputes.some((row) => !["won", "lost", "warning_closed"].includes(row.status));
      const own = Number(
        (
          await sql.query<{ total: string }>(
            "select coalesce(sum(amount_cents),0) as total from app.refund_operations where payment_intent_id=$1 and hold_state='settled'",
            [input.paymentIntentId],
          )
        ).rows[0].total,
      );
      const losses =
        evidence.refunds
          .filter((row) => row.status === "succeeded")
          .reduce((sum, row) => sum + row.amountCents, 0) +
        evidence.disputes
          .filter((row) => row.status === "lost")
          .reduce((sum, row) => sum + row.amountCents, 0);
      const target = Math.max(0, Math.min(checkout.amount_cents, losses) - own);
      await sql.query(
        "insert into app.payment_reconciliations(payment_intent_id,wallet_id) values($1,$2) on conflict do nothing",
        [input.paymentIntentId, checkout.wallet_id],
      );
      const prior = (
        await sql.query<{ external_debit_cents: number }>(
          "select external_debit_cents from app.payment_reconciliations where payment_intent_id=$1 for update",
          [input.paymentIntentId],
        )
      ).rows[0].external_debit_cents;
      const adjustment =
        target >= prior ? -Math.min(wallet.available_cents, target - prior) : prior - target;
      const applied = prior - adjustment;
      const debt = Math.max(0, target - applied);
      if (adjustment) {
        await sql.query("update app.wallets set available_cents=available_cents+$2 where id=$1", [
          checkout.wallet_id,
          adjustment,
        ]);
        await ledger(
          sql,
          checkout.wallet_id,
          adjustment < 0 ? "incident_debit" : "incident_restore",
          Math.abs(adjustment),
          adjustment,
          0,
          `incident:${input.operationId}`,
        );
      }
      await sql.query(
        "update app.payment_reconciliations set external_debit_cents=$2,debt_cents=$3,updated_at=now() where payment_intent_id=$1",
        [input.paymentIntentId, applied, debt],
      );
      const result = outstanding || debt ? "pending" : "resolved";
      const resolution = (
        await sql.query<ResolutionRecord>(
          `insert into app.financial_resolutions(operation_id,actor_id,payment_intent_id,reason,adjustment_cents,debt_cents,result,evidence) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning ${resolutionColumns}`,
          [
            input.operationId,
            input.actorId,
            input.paymentIntentId,
            input.reason,
            adjustment,
            debt,
            result,
            JSON.stringify(evidence),
          ],
        )
      ).rows[0];
      if (result === "resolved")
        await sql.query(
          "insert into app.financial_event_resolutions(event_id,operation_id) select id,$2 from app.financial_events where payment_intent_id=$1 on conflict do nothing",
          [input.paymentIntentId, input.operationId],
        );
      const remaining = (
        await sql.query<{ blocked: boolean }>(
          "select exists(select 1 from app.financial_events e join app.checkout_intents c on c.payment_intent_id=e.payment_intent_id left join app.financial_event_resolutions r on r.event_id=e.id where c.wallet_id=$1 and r.event_id is null) or exists(select 1 from app.payment_reconciliations where wallet_id=$1 and debt_cents>0) as blocked",
          [checkout.wallet_id],
        )
      ).rows[0].blocked;
      if (result === "resolved" && !remaining && wallet.blocked_reason?.startsWith("payment_"))
        await sql.query("update app.wallets set blocked_reason=null where id=$1", [
          checkout.wallet_id,
        ]);
      else if (result === "pending")
        await sql.query(
          "update app.wallets set blocked_reason='payment_reconciliation_pending' where id=$1",
          [checkout.wallet_id],
        );
      await recordOperatorAudit(sql, {
        actorId: input.actorId,
        role,
        action: "incident.resolve",
        targetType: "payment",
        targetId: input.paymentIntentId,
        reason: input.reason,
        details: {
          operationId: input.operationId,
          result,
          adjustmentCents: adjustment,
          debtCents: debt,
        },
      });
      return resolution;
    });
  }

  async reconcileRefunds(limit = 5) {
    const rows = await this.repo.database.withService(
      async (sql) =>
        (
          await sql.query<{ id: string }>(
            "select id from app.refund_operations where status in ('requested','submitting','unknown','pending','requires_action') and next_reconcile_at<=now() and (lease_until is null or lease_until<=now()) order by next_reconcile_at,id limit $1",
            [Math.max(1, Math.min(10, limit))],
          )
        ).rows,
    );
    for (const row of rows) await this.processRefund(row.id);
    return { inspected: rows.length };
  }

  /** Missing-session scans are bounded and resumable. Never creates Checkout or retries a charge. */
  async reconcileCheckouts(options: { limit?: number; maxPages?: number } = {}) {
    const limit = Math.max(1, Math.min(10, options.limit ?? 5));
    const pages = Math.max(1, Math.min(5, options.maxPages ?? 2));
    const rows = await this.repo.database.withService(
      async (sql) =>
        (
          await sql.query<{
            id: string;
            provider_session_id: string | null;
            created_at: Date;
            reconcile_cursor: string | null;
            reconcile_matches: string[];
          }>(
            "with due as (select id from app.checkout_intents where status='pending' and created_at<now()-interval '5 minutes' and next_reconcile_at<=now() and (reconcile_lease_until is null or reconcile_lease_until<now()) order by next_reconcile_at,id for update skip locked limit $1) update app.checkout_intents c set reconcile_lease_until=now()+interval '2 minutes',next_reconcile_at=now()+interval '10 minutes' from due where c.id=due.id returning c.id,c.provider_session_id,c.created_at,c.reconcile_cursor,c.reconcile_matches",
            [limit],
          )
        ).rows,
    );
    let resolved = 0;
    for (const row of rows) {
      try {
        let sessionId = row.provider_session_id;
        if (!sessionId) {
          const created = new Date(row.created_at).getTime();
          // App creation retries stop at 23h. Wait past that interval before declaring a full fixed scan empty.
          if (Date.now() - created < 26 * 3_600_000) continue;
          let cursor = row.reconcile_cursor;
          const matches = new Set(row.reconcile_matches);
          for (let page = 0; page < pages; page++) {
            const scan = await this.provider.listFundingSessions({
              createdAfter: Math.floor(created / 1000) - 60,
              createdBefore: Math.floor(created / 1000) + 25 * 3600,
              cursor,
            });
            for (const item of scan.items) if (item.fundingId === row.id) matches.add(item.id);
            if (matches.size > 1)
              throw new RepositoryError(
                "reconciliation_required",
                "Multiple Checkout sessions match one funding operation",
              );
            cursor = scan.nextCursor;
            await this.repo.database.withService((sql) =>
              sql.query(
                "update app.checkout_intents set reconcile_cursor=$2,reconcile_matches=$3::text[] where id=$1 and status='pending'",
                [row.id, cursor, [...matches]],
              ),
            );
            if (scan.hasMore) {
              if (!cursor) throw new Error("Incomplete Checkout pagination");
              continue;
            }
            sessionId = [...matches][0] ?? null;
            if (!sessionId) {
              await this.repo.database.withService((sql) =>
                sql.query(
                  "update app.checkout_intents set status='cancelled',reconcile_error='no_provider_session_after_complete_scan',updated_at=now() where id=$1 and status='pending' and provider_session_id is null",
                  [row.id],
                ),
              );
              resolved++;
            }
            break;
          }
        }
        if (sessionId) {
          const intent = await this.repo.getCheckout(row.id);
          if (!intent?.userId) throw new Error("Checkout owner unavailable");
          const result = await this.provider.retrieveFunding({
            sessionId,
            fundingId: row.id,
            userId: intent.userId,
            amountCents: intent.amountCents,
          });
          await this.repo.attachCheckoutSession(row.id, sessionId);
          if (result.status === "paid" && result.paymentIntentId) {
            await this.repo.fundCheckout({
              checkoutId: row.id,
              providerSessionId: sessionId,
              paymentIntentId: result.paymentIntentId,
              amountCents: result.amountCents,
              currency: result.currency,
              eventId: `reconcile:${row.id}`,
            });
            resolved++;
          } else if (result.status === "failed") {
            await this.repo.expireCheckout(row.id, sessionId);
            resolved++;
          }
        }
      } catch {
        await this.repo.database.withService((sql) =>
          sql.query(
            "update app.checkout_intents set reconcile_error='provider_reconciliation_failed' where id=$1",
            [row.id],
          ),
        );
      } finally {
        await this.repo.database.withService((sql) =>
          sql.query("update app.checkout_intents set reconcile_lease_until=null where id=$1", [
            row.id,
          ]),
        );
      }
    }
    return { inspected: rows.length, resolved };
  }
}
