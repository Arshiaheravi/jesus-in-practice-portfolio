import { assertOperator, recordOperatorAudit } from "./operators.ts";
import { BackendRepository, RepositoryError, type ReservationRecord } from "./repository.ts";

export interface DeliveryChargeWaiver {
  operationId: string;
  deliveryId: string;
  walletId: string;
  reservationId: string;
  amountCents: number;
  actorId: string;
  reason: string;
  createdAt: string;
}
export interface DeliveryWaiverInput {
  operationId: string;
  deliveryId: string;
  actorId: string;
  reason: string;
  confirmed: true;
}
const columns = `operation_id as "operationId",delivery_id as "deliveryId",wallet_id as "walletId",reservation_id as "reservationId",amount_cents as "amountCents",actor_id as "actorId",reason,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`;
function assertSame(existing: DeliveryChargeWaiver, input: DeliveryWaiverInput) {
  if (
    existing.deliveryId !== input.deliveryId ||
    existing.actorId !== input.actorId ||
    existing.reason !== input.reason
  )
    throw new RepositoryError(
      "operation_conflict",
      "This operation identifier has different waiver details",
    );
  return existing;
}

/** Server capability. The HTTP boundary also requires recent verified administrator MFA. */
export class DeliverySupport {
  private readonly repository: BackendRepository;
  private readonly policyApproved: boolean;
  constructor(repository: BackendRepository, options: { commercePolicyApproved?: boolean } = {}) {
    this.repository = repository;
    this.policyApproved = options.commercePolicyApproved === true;
  }

  /** Merchant-funded charge waiver, never a statement that the message was not delivered. */
  async waiveUnknownDelivery(input: DeliveryWaiverInput): Promise<DeliveryChargeWaiver> {
    if (!this.policyApproved)
      throw new RepositoryError(
        "commerce_policy_required",
        "Approve the commerce policy before waiving a charge",
      );
    if (input.confirmed !== true)
      throw new RepositoryError(
        "confirmation_required",
        "Confirm that the service bears any provider cost",
      );
    if (
      [input.operationId, input.deliveryId, input.actorId].some(
        (value) => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value),
      )
    )
      throw new RepositoryError(
        "invalid_operation",
        "Valid operation and delivery identifiers are required",
      );
    if (input.reason.trim().length < 10 || input.reason.length > 500)
      throw new RepositoryError(
        "invalid_reason",
        "Provide an audit reason between 10 and 500 characters",
      );
    return this.repository.database.withService(async (sql) => {
      const role = await assertOperator(sql, input.actorId, ["admin"]);
      const prior = (
        await sql.query<DeliveryChargeWaiver>(
          `select ${columns} from app.delivery_charge_waivers where operation_id=$1`,
          [input.operationId],
        )
      ).rows[0];
      if (prior) return assertSame(prior, input);
      const initial = (
        await sql.query<{ user_id: string }>("select user_id from app.deliveries where id=$1", [
          input.deliveryId,
        ])
      ).rows[0];
      if (!initial) throw new RepositoryError("not_found", "Delivery record not found");
      // Same lock order as worker completion and account deletion.
      const profile = (
        await sql.query<{ deleting: boolean }>(
          "select deleting from app.profiles where user_id=$1 for update",
          [initial.user_id],
        )
      ).rows[0];
      if (!profile || profile.deleting)
        throw new RepositoryError(
          "waiver_unavailable",
          "The account is not available for this charge waiver",
        );
      const wallet = (
        await sql.query<{ id: string }>("select id from app.wallets where user_id=$1 for update", [
          initial.user_id,
        ])
      ).rows[0];
      if (!wallet) throw new RepositoryError("not_found", "Wallet record not found");
      const delivery = (
        await sql.query<{ status: string; channel: string; provider_id: string | null }>(
          "select status,channel,provider_id from app.deliveries where id=$1 for update",
          [input.deliveryId],
        )
      ).rows[0];
      const reservation = (
        await sql.query<ReservationRecord>(
          `select id,wallet_id as "walletId",delivery_id as "deliveryId",amount_cents as "amountCents",status from app.credit_reservations where delivery_id=$1 for update`,
          [input.deliveryId],
        )
      ).rows[0];
      const duplicate = (
        await sql.query<DeliveryChargeWaiver>(
          `select ${columns} from app.delivery_charge_waivers where operation_id=$1`,
          [input.operationId],
        )
      ).rows[0];
      if (duplicate) return assertSame(duplicate, input);
      if (
        !delivery ||
        delivery.status !== "unknown" ||
        delivery.channel !== "sms" ||
        !reservation ||
        reservation.status !== "held" ||
        reservation.walletId !== wallet.id
      )
        throw new RepositoryError(
          "waiver_unavailable",
          "Only the held credit of an uncertain SMS can be waived",
        );
      const record = (
        await sql.query<DeliveryChargeWaiver>(
          `insert into app.delivery_charge_waivers(operation_id,wallet_id,reservation_id,delivery_id,actor_id,amount_cents,reason,provider_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning ${columns}`,
          [
            input.operationId,
            wallet.id,
            reservation.id,
            input.deliveryId,
            input.actorId,
            reservation.amountCents,
            input.reason,
            delivery.provider_id,
          ],
        )
      ).rows[0];
      await sql.query(
        "update app.wallets set available_cents=available_cents+$2,reserved_cents=reserved_cents-$2 where id=$1",
        [wallet.id, reservation.amountCents],
      );
      await sql.query(
        "update app.credit_reservations set status='waived',updated_at=now() where id=$1",
        [reservation.id],
      );
      await sql.query(
        "insert into app.credit_ledger(wallet_id,kind,amount_cents,available_delta,reserved_delta,idempotency_key) values($1,'waiver',$2,$2,-($2::integer),$3)",
        [wallet.id, reservation.amountCents, `waiver:${input.operationId}`],
      );
      await recordOperatorAudit(sql, {
        actorId: input.actorId,
        role,
        action: "delivery.waive_charge",
        targetType: "delivery",
        targetId: input.deliveryId,
        reason: input.reason,
        details: {
          operationId: input.operationId,
          amountCents: reservation.amountCents,
          merchantBearsProviderCost: true,
          deliveryStatus: "unknown",
        },
      });
      return record;
    });
  }
}
