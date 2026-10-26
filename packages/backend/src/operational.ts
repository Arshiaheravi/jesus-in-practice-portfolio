import { randomUUID } from "node:crypto";
import { consentVersion } from "./contracts.ts";
import type { Channel, Preferences, Schedule } from "./contracts.ts";
import type { SqlExecutor } from "./database.ts";
import type { BackendRepository } from "./repository.ts";

export interface FrozenPayload {
  to: string;
  localDate: string;
  quoteCents: number;
  rateCents: number;
  segments: number;
  body?: string;
  subject?: string;
  html?: string;
  text?: string;
  unsubscribeUrl?: string;
}
export interface Delivery {
  id: string;
  userId: string;
  channel: Channel;
  practiceId: string;
  contentVersion: string;
  profileVersion: number;
  contactId: string;
  contactVersion: number;
  consentId: string;
  destinationHash: string;
  payload: FrozenPayload;
  status: string;
  claimToken: string | null;
  providerId: string | null;
  expiresAt: string;
}
export interface DeliveryContext {
  contactId: string;
  contactVersion: number;
  value: string;
  destinationHash: string;
  consentId: string;
  consentVersion: string;
}
const columns = `id,user_id as "userId",channel,practice_id as "practiceId",content_version as "contentVersion",profile_version as "profileVersion",contact_id as "contactId",contact_version as "contactVersion",consent_id as "consentId",destination_hash as "destinationHash",payload,status,claim_token as "claimToken",provider_id as "providerId",expires_at as "expiresAt"`;

export class DeliveryStore {
  readonly repo: BackendRepository;
  constructor(repo: BackendRepository) {
    this.repo = repo;
  }

  async context(
    userId: string,
    channel: Channel,
    sql?: SqlExecutor,
  ): Promise<DeliveryContext | null> {
    const run = async (connection: SqlExecutor) =>
      (
        await connection.query<DeliveryContext>(
          `select c.id as "contactId",c.version as "contactVersion",c.value,c.destination_hash as "destinationHash",e.id as "consentId",e.wording_version as "consentVersion" from app.contacts c join lateral (select id,granted,wording_version from app.consent_events where user_id=c.user_id and channel=c.channel and destination_hash=c.destination_hash order by sequence desc limit 1) e on e.granted where c.user_id=$1 and c.channel=$2 and c.verified_at is not null and not exists(select 1 from app.suppressions s where s.channel=c.channel and s.destination_hash=c.destination_hash)`,
          [userId, channel],
        )
      ).rows[0] ?? null;
    return sql ? run(sql) : this.repo.database.withService(run);
  }

  async enqueue(input: {
    userId: string;
    occurrenceKey: string;
    channel: Channel;
    practiceId: string;
    contentVersion: string;
    profileVersion: number;
    context: DeliveryContext;
    payload: FrozenPayload;
    scheduledAt: Date;
    expiresAt: Date;
  }) {
    return this.repo.database.withService(async (sql) => {
      const result = await sql.query<{ id: string }>(
        `insert into app.deliveries(user_id,occurrence_key,channel,practice_id,content_version,profile_version,contact_id,contact_version,consent_id,destination_hash,payload,scheduled_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13) on conflict(user_id,occurrence_key,channel) do nothing returning id`,
        [
          input.userId,
          input.occurrenceKey,
          input.channel,
          input.practiceId,
          input.contentVersion,
          input.profileVersion,
          input.context.contactId,
          input.context.contactVersion,
          input.context.consentId,
          input.context.destinationHash,
          JSON.stringify(input.payload),
          input.scheduledAt,
          input.expiresAt,
        ],
      );
      return result.rows[0]?.id ?? null;
    });
  }

  async claim(limit = 10, channels: Channel[] = ["email", "sms"]): Promise<Delivery[]> {
    return this.repo.database.withService(async (sql) => {
      await sql.query(
        "update app.deliveries set status='unknown',failure_code='worker_interrupted',updated_at=now() where status='sending' and lease_until<now()",
      );
      await sql.query(
        "update app.delivery_attempts a set status='unknown',error_code='worker_interrupted',updated_at=now() from app.deliveries d where a.delivery_id=d.id and a.attempt=d.attempt_count and a.status='sending' and d.status='unknown' and d.failure_code='worker_interrupted'",
      );
      await sql.query(
        "update app.deliveries set status='cancelled',failure_code='expired',updated_at=now() where status in ('queued','claimed') and expires_at<=now()",
      );
      return (
        await sql.query<Delivery>(
          `with due as (select id from app.deliveries where channel=any($2::text[]) and (status='queued' or (status='claimed' and lease_until<now())) and scheduled_at<=now() and expires_at>now() order by scheduled_at,id for update skip locked limit $1) update app.deliveries d set status='claimed',claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() from due where d.id=due.id returning ${columns
            .split(",")
            .map((part) => `d.${part}`)
            .join(",")}`,
          [Math.min(25, Math.max(1, limit)), channels],
        )
      ).rows;
    });
  }

  async begin(
    id: string,
    claimToken: string,
    currentRate: number | null,
    options: { allowPublished?: boolean } = {},
  ): Promise<Delivery | null> {
    return this.repo.database.withService(async (sql) => {
      const initial = (
        await sql.query<{ user_id: string }>("select user_id from app.deliveries where id=$1", [id])
      ).rows[0];
      if (!initial) return null;
      const profile = (
        await sql.query<{
          deleting: boolean;
          delivery_version: number;
          preferences: Preferences;
          schedule: Schedule;
        }>(
          "select deleting,delivery_version,preferences,schedule from app.profiles where user_id=$1 for update",
          [initial.user_id],
        )
      ).rows[0];
      // Consistent profile -> wallet -> delivery -> reservation lock order.
      const wallet = (
        await sql.query<{ available_cents: number; blocked_reason: string | null }>(
          "select available_cents,blocked_reason from app.wallets where user_id=$1 for update",
          [initial.user_id],
        )
      ).rows[0];
      const delivery = (
        await sql.query<Delivery>(`select ${columns} from app.deliveries where id=$1 for update`, [
          id,
        ])
      ).rows[0];
      if (!delivery || delivery.status !== "claimed" || delivery.claimToken !== claimToken)
        return null;
      const context = await this.context(delivery.userId, delivery.channel, sql);
      let failure: string | null = null;
      const publishedVersion =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          delivery.contentVersion,
        );
      const contentAllowed =
        !publishedVersion ||
        (options.allowPublished === true &&
          (
            await sql.query<{ allowed: boolean }>(
              "select app.content_version_available($1::uuid,$2::text) as allowed",
              [delivery.contentVersion, delivery.channel],
            )
          ).rows[0].allowed);
      if (
        !profile ||
        profile.deleting ||
        !profile.preferences.onboarded ||
        profile.schedule.paused ||
        profile.delivery_version !== delivery.profileVersion
      )
        failure = "preferences_changed";
      else if (![delivery.channel, "both"].includes(profile.preferences.channel))
        failure = "channel_disabled";
      else if (
        !context ||
        context.contactId !== delivery.contactId ||
        context.contactVersion !== delivery.contactVersion ||
        context.consentId !== delivery.consentId ||
        context.consentVersion !== consentVersion(delivery.channel, currentRate) ||
        context.destinationHash !== delivery.destinationHash
      )
        failure = "permission_changed";
      else if (new Date(delivery.expiresAt).getTime() <= Date.now()) failure = "expired";
      else if (
        delivery.channel === "sms" &&
        (currentRate !== delivery.payload.rateCents || !currentRate)
      )
        failure = "price_changed";
      else if (
        delivery.channel === "sms" &&
        (!wallet || wallet.blocked_reason || wallet.available_cents < delivery.payload.quoteCents)
      )
        failure = "sms_credit_unavailable";
      const daily = Number(
        (
          await sql.query<{ total: string }>(
            "select count(*) as total from app.deliveries where user_id=$1 and channel=$2 and payload->>'localDate'=$3 and status in ('sending','submitted','delivered','unknown')",
            [delivery.userId, delivery.channel, delivery.payload.localDate],
          )
        ).rows[0].total,
      );
      if (daily >= 3) failure = "daily_limit";
      if (!contentAllowed) failure = "content_withdrawn";
      if (failure) {
        await sql.query(
          "update app.deliveries set status='cancelled',failure_code=$2,updated_at=now() where id=$1",
          [id, failure],
        );
        return null;
      }
      if (delivery.channel === "sms")
        await this.repo.reserveCredits(delivery.userId, id, delivery.payload.quoteCents, sql);
      await sql.query(
        "update app.deliveries set status='sending',attempt_count=attempt_count+1,lease_until=now()+interval '2 minutes',updated_at=now() where id=$1",
        [id],
      );
      await sql.query(
        "insert into app.delivery_attempts(id,delivery_id,attempt,status) select $2,id,attempt_count,'sending' from app.deliveries where id=$1",
        [id, randomUUID()],
      );
      return { ...delivery, status: "sending" };
    });
  }

  /** Terminal transitions are monotone; an early callback can arrive before the send response. */
  async finish(
    id: string,
    status: "submitted" | "delivered" | "failed" | "unknown",
    providerId?: string,
    failureCode?: string,
  ) {
    await this.repo.database.withService(async (sql) => {
      const initial = (
        await sql.query<{ user_id: string }>("select user_id from app.deliveries where id=$1", [id])
      ).rows[0];
      if (!initial) return;
      await sql.query("select user_id from app.profiles where user_id=$1 for update", [
        initial.user_id,
      ]);
      await sql.query("select id from app.wallets where user_id=$1 for update", [initial.user_id]);
      const delivery = (
        await sql.query<Delivery>(`select ${columns} from app.deliveries where id=$1 for update`, [
          id,
        ])
      ).rows[0];
      if (!delivery || ["cancelled", "queued", "claimed"].includes(delivery.status)) return;
      if (delivery.providerId && providerId && delivery.providerId !== providerId)
        throw new Error("Provider identifier mismatch");
      if (["delivered", "failed"].includes(delivery.status)) return;
      if (delivery.status === "submitted" && status === "unknown") return;
      if (delivery.channel === "sms" && status === "delivered")
        await this.repo.settleCredits(id, sql);
      if (delivery.channel === "sms" && status === "failed")
        await this.repo.releaseCredits(id, sql);
      await sql.query(
        "update app.deliveries set status=$2,provider_id=coalesce(provider_id,$3),failure_code=$4,updated_at=now() where id=$1",
        [id, status, providerId ?? null, failureCode ?? null],
      );
      await sql.query(
        "update app.delivery_attempts set status=$2,provider_id=coalesce(provider_id,$3),error_code=$4,updated_at=now() where delivery_id=$1 and attempt=(select attempt_count from app.deliveries where id=$1)",
        [id, status, providerId ?? null, failureCode ?? null],
      );
    });
  }

  async findByProvider(channel: Channel, providerId: string) {
    return this.repo.database.withService(
      async (sql) =>
        (
          await sql.query<Delivery>(
            `select ${columns} from app.deliveries where channel=$1 and provider_id=$2`,
            [channel, providerId],
          )
        ).rows[0] ?? null,
    );
  }
  async get(id: string) {
    return this.repo.database.withService(
      async (sql) =>
        (await sql.query<Delivery>(`select ${columns} from app.deliveries where id=$1`, [id]))
          .rows[0] ?? null,
    );
  }
  async unresolved(limit = 10) {
    return this.repo.database.withService(
      async (sql) =>
        (
          await sql.query<Delivery>(
            `select ${columns} from app.deliveries where channel='sms' and status in ('submitted','unknown') and provider_id is not null and updated_at<now()-interval '5 minutes' and (next_reconcile_at is null or next_reconcile_at<=now()) order by next_reconcile_at nulls first,created_at,id limit $1`,
            [limit],
          )
        ).rows,
    );
  }
  async reconciled(id: string) {
    await this.repo.database.withService(async (sql) => {
      await sql.query(
        "update app.deliveries set last_reconcile_attempt_at=now(),next_reconcile_at=now()+interval '10 minutes' where id=$1",
        [id],
      );
    });
  }
}
