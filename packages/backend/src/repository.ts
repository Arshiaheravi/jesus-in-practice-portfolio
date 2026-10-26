import type { Channel, MemberCommand, Preferences, Schedule } from "./contracts.ts";
import { getPractice } from "@jesus-in-practice/content";
import { defaultPreferences, defaultSchedule } from "./contracts.ts";
import type { Database, SqlExecutor } from "./database.ts";

export class RepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
  }
}
export interface ProfileRecord {
  userId: string;
  preferences: Preferences;
  schedule: Schedule;
  version: number;
  deliveryVersion: number;
  deliveryUpdatedAt: string;
  deleting: boolean;
}
export interface ContactRecord {
  id: string;
  userId: string;
  channel: Channel;
  value: string;
  destinationHash: string;
  verifiedAt: string | null;
  version: number;
  consentId: string | null;
  consentVersion: string | null;
  consentGranted: boolean;
}
export interface WalletRecord {
  id: string;
  availableCents: number;
  reservedCents: number;
  blockedReason: string | null;
}
export interface CompletionRecord {
  id: string;
  practiceId: string;
  localDate: string;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}
export interface RepositoryState {
  profile: ProfileRecord;
  saved: string[];
  notes: Record<string, string>;
  completions: Page<CompletionRecord>;
  contacts: ContactRecord[];
  wallet: WalletRecord;
}
export interface CheckoutRecord {
  id: string;
  walletId: string;
  amountCents: number;
  currency: "cad";
  providerSessionId: string | null;
  paymentIntentId: string | null;
  status: string;
  createdAt: string;
}
export interface ReservationRecord {
  id: string;
  walletId: string;
  deliveryId: string;
  amountCents: number;
  status: "held" | "settled" | "released" | "waived";
}
export interface LedgerRecord {
  id: string;
  kind: string;
  amountCents: number;
  createdAt: string;
}

const iso = (value: string | Date): string => (value instanceof Date ? value.toISOString() : value);
const boundedLimit = (value = 100): number => Math.max(1, Math.min(250, Math.trunc(value)));
const profileColumns = `user_id as "userId", preferences, schedule, version, delivery_version as "deliveryVersion", to_char(delivery_updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "deliveryUpdatedAt", deleting`;
const walletColumns =
  'id, available_cents as "availableCents", reserved_cents as "reservedCents", blocked_reason as "blockedReason"';
const checkoutColumns = `id, wallet_id as "walletId", amount_cents as "amountCents", currency, provider_session_id as "providerSessionId", payment_intent_id as "paymentIntentId", status, to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`;
const reservationColumns =
  'id,wallet_id as "walletId",delivery_id as "deliveryId",amount_cents as "amountCents",status';
function requireProfile(profile: ProfileRecord | undefined): ProfileRecord {
  if (!profile) throw new RepositoryError("not_found", "Account record not found");
  if (profile.deleting)
    throw new RepositoryError("account_deleting", "Account deletion is pending");
  return profile;
}
function positiveCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000000)
    throw new RepositoryError("invalid_amount", "Invalid CAD amount");
}
function encodeCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64url");
}
function decodeCursor(cursor?: string | null): { date: string; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      date?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.date !== "string" ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id) ||
      !Number.isFinite(Date.parse(parsed.date))
    )
      throw new Error();
    return { date: parsed.date, id: parsed.id };
  } catch {
    throw new RepositoryError("invalid_cursor", "Invalid history cursor");
  }
}

export class BackendRepository {
  readonly database: Database;
  constructor(database: Database) {
    this.database = database;
  }

  async ensureProfile(userId: string): Promise<void> {
    await this.database.withService(async (sql) => {
      await sql.query(
        "insert into app.profiles(user_id, preferences, schedule) values($1,$2::jsonb,$3::jsonb) on conflict(user_id) do nothing",
        [userId, JSON.stringify(defaultPreferences), JSON.stringify(defaultSchedule)],
      );
      await sql.query(
        "insert into app.wallets(user_id) values($1) on conflict(user_id) do nothing",
        [userId],
      );
    });
  }

  async getState(userId: string): Promise<RepositoryState> {
    return this.database.withUser(userId, async (sql) => {
      const profile = requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for share`,
            [userId],
          )
        ).rows[0],
      );
      const saved = (
        await sql.query<{ practice_id: string }>(
          "select practice_id from app.saved_practices where user_id=$1 order by created_at, practice_id",
          [userId],
        )
      ).rows.map((row) => row.practice_id);
      const notes = Object.fromEntries(
        (
          await sql.query<{ practice_id: string; body: string }>(
            "select practice_id, body from app.notes where user_id=$1",
            [userId],
          )
        ).rows.map((row) => [row.practice_id, row.body]),
      );
      const completions = await this.history(sql, userId, {});
      const contacts = await this.contacts(sql, userId);
      const wallet = (
        await sql.query<WalletRecord>(`select ${walletColumns} from app.wallets where user_id=$1`, [
          userId,
        ])
      ).rows[0];
      if (!wallet) throw new RepositoryError("not_found", "Wallet record not found");
      return { profile, saved, notes, completions, contacts, wallet };
    });
  }

  async mutateMember(
    userId: string,
    expectedVersion: number,
    command: MemberCommand,
    options: { allowPublished?: boolean } = {},
  ): Promise<number> {
    return this.database.withUser(userId, async (sql) => {
      const profile = requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for update`,
            [userId],
          )
        ).rows[0],
      );
      if (profile.version !== expectedVersion)
        throw new RepositoryError("conflict", "Your account changed. Reload before saving.");
      const createsPracticeRecord =
        (command.type === "saved" && command.saved) ||
        (command.type === "completion" && command.completed) ||
        (command.type === "reflection" && command.text.length > 0);
      if (createsPracticeRecord && "practiceId" in command && !getPractice(command.practiceId)) {
        const available =
          options.allowPublished === true &&
          (
            await sql.query<{ available: boolean }>(
              "select app.content_practice_available($1) as available",
              [command.practiceId],
            )
          ).rows[0]?.available;
        if (!available)
          throw new RepositoryError(
            "practice_unavailable",
            "This practice is not currently published. Your existing records remain available.",
          );
      }
      let preferences = profile.preferences;
      let schedule = profile.schedule;
      switch (command.type) {
        case "preferences":
          preferences = {
            ...preferences,
            source: command.source,
            topics: command.topics,
            channel: command.channel,
            timezone: command.timezone,
          };
          break;
        case "schedule":
          schedule = command.schedule;
          preferences = { ...preferences, channel: command.channel, timezone: command.timezone };
          break;
        case "onboarding":
          schedule = command.schedule;
          preferences = {
            onboarded: true,
            source: command.source,
            topics: command.topics,
            channel: command.channel,
            timezone: command.timezone,
          };
          break;
        case "saved":
          if (command.saved)
            await sql.query(
              "insert into app.saved_practices(user_id, practice_id) values($1,$2) on conflict do nothing",
              [userId, command.practiceId],
            );
          else
            await sql.query("delete from app.saved_practices where user_id=$1 and practice_id=$2", [
              userId,
              command.practiceId,
            ]);
          break;
        case "completion":
          if (command.completed)
            await sql.query(
              "insert into app.completions(user_id,practice_id,local_date) values($1,$2,$3::date) on conflict do nothing",
              [userId, command.practiceId, command.date],
            );
          else
            await sql.query(
              "delete from app.completions where user_id=$1 and practice_id=$2 and local_date=$3::date",
              [userId, command.practiceId, command.date],
            );
          break;
        case "reflection":
          if (command.text.length)
            await sql.query(
              "insert into app.notes(user_id,practice_id,body) values($1,$2,$3) on conflict(user_id,practice_id) do update set body=excluded.body, updated_at=now()",
              [userId, command.practiceId, command.text],
            );
          else
            await sql.query("delete from app.notes where user_id=$1 and practice_id=$2", [
              userId,
              command.practiceId,
            ]);
          break;
      }
      const deliveryChanged = ["preferences", "schedule", "onboarding"].includes(command.type);
      await sql.query(
        "update app.profiles set preferences=$2::jsonb,schedule=$3::jsonb,version=version+1,delivery_version=delivery_version+case when $4 then 1 else 0 end,delivery_updated_at=case when $4 then now() else delivery_updated_at end,updated_at=now() where user_id=$1",
        [userId, JSON.stringify(preferences), JSON.stringify(schedule), deliveryChanged],
      );
      return profile.version + 1;
    });
  }

  listHistory(
    userId: string,
    options: { cursor?: string | null; limit?: number } = {},
  ): Promise<Page<CompletionRecord>> {
    return this.database.withUser(userId, async (sql) => {
      requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for share`,
            [userId],
          )
        ).rows[0],
      );
      return this.history(sql, userId, options);
    });
  }
  private async history(
    sql: SqlExecutor,
    userId: string,
    options: { cursor?: string | null; limit?: number },
  ): Promise<Page<CompletionRecord>> {
    const limit = boundedLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const rows = (
      await sql.query<CompletionRecord>(
        `select id,practice_id as "practiceId",to_char(local_date,'YYYY-MM-DD') as "localDate",created_at as "createdAt" from app.completions where user_id=$1 and ($2::date is null or (local_date,id)<($2::date,$3::uuid)) order by local_date desc,id desc limit $4`,
        [userId, cursor?.date ?? null, cursor?.id ?? null, limit + 1],
      )
    ).rows;
    const total = Number(
      (
        await sql.query<{ total: string }>(
          "select count(*) as total from app.completions where user_id=$1",
          [userId],
        )
      ).rows[0].total,
    );
    const items = rows.slice(0, limit).map((row) => ({ ...row, createdAt: iso(row.createdAt) }));
    const last = items.at(-1);
    const hasMore = rows.length > limit;
    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.localDate, last.id) : null,
    };
  }

  private async contacts(sql: SqlExecutor, userId: string): Promise<ContactRecord[]> {
    return (
      await sql.query<ContactRecord>(
        `select c.id,c.user_id as "userId",c.channel,c.value,c.destination_hash as "destinationHash",c.verified_at as "verifiedAt",c.version,e.id as "consentId",e.wording_version as "consentVersion",coalesce(e.granted,false) as "consentGranted" from app.contacts c left join lateral (select id,granted,wording_version from app.consent_events where user_id=c.user_id and channel=c.channel and destination_hash=c.destination_hash order by sequence desc limit 1) e on true where c.user_id=$1 order by c.channel`,
        [userId],
      )
    ).rows.map((row) => ({ ...row, verifiedAt: row.verifiedAt ? iso(row.verifiedAt) : null }));
  }

  async upsertContact(
    userId: string,
    channel: Channel,
    value: string,
    verified: boolean,
    destinationHash: string,
  ): Promise<ContactRecord> {
    return this.database.withService(async (sql) => {
      requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for update`,
            [userId],
          )
        ).rows[0],
      );
      await sql.query(
        `insert into app.contacts(user_id,channel,value,destination_hash,verified_at) values($1,$2,$3,$4,case when $5 then now() else null end) on conflict(user_id,channel) do update set value=excluded.value,destination_hash=excluded.destination_hash,verified_at=case when $5 then coalesce(case when app.contacts.destination_hash=excluded.destination_hash then app.contacts.verified_at end,now()) else null end,version=case when app.contacts.destination_hash<>excluded.destination_hash or (app.contacts.verified_at is not null)<>$5 then app.contacts.version+1 else app.contacts.version end,updated_at=now()`,
        [userId, channel, value, destinationHash, verified],
      );
      return (await this.contacts(sql, userId)).find((contact) => contact.channel === channel)!;
    });
  }

  async setConsent(
    userId: string,
    channel: Channel,
    enabled: boolean,
    wordingVersion: string,
  ): Promise<string> {
    return this.database.withService(async (sql) => {
      requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for update`,
            [userId],
          )
        ).rows[0],
      );
      const contact = (await this.contacts(sql, userId)).find((row) => row.channel === channel);
      if (!contact || (enabled && !contact.verifiedAt))
        throw new RepositoryError(
          "unverified_contact",
          "Verify this destination before enabling messages",
        );
      if (enabled) {
        const suppression = (
          await sql.query<{ reason: string }>(
            "select reason from app.suppressions where channel=$1 and destination_hash=$2",
            [channel, contact.destinationHash],
          )
        ).rows[0];
        if (suppression && suppression.reason !== "unsubscribe")
          throw new RepositoryError(
            "contact_suppressed",
            "This destination is blocked by the messaging provider",
          );
        await sql.query(
          "delete from app.suppressions where channel=$1 and destination_hash=$2 and reason='unsubscribe'",
          [channel, contact.destinationHash],
        );
      }
      const id = (
        await sql.query<{ id: string }>(
          "insert into app.consent_events(user_id,channel,destination_hash,granted,wording_version,reason) values($1,$2,$3,$4,$5,'member-choice') returning id",
          [userId, channel, contact.destinationHash, enabled, wordingVersion],
        )
      ).rows[0].id;
      return id;
    });
  }

  async suppressDestination(
    channel: Channel,
    destinationHash: string,
    reason: string,
  ): Promise<void> {
    await this.database.withService(async (sql) => {
      await sql.query(
        "insert into app.suppressions(channel,destination_hash,reason) values($1,$2,$3) on conflict(channel,destination_hash) do update set reason=case when app.suppressions.reason='unsubscribe' then excluded.reason else app.suppressions.reason end",
        [channel, destinationHash, reason],
      );
      await sql.query(
        "insert into app.consent_events(user_id,channel,destination_hash,granted,wording_version,reason) select user_id,channel,destination_hash,false,'provider-event',$3 from app.contacts where channel=$1 and destination_hash=$2",
        [channel, destinationHash, reason],
      );
      await sql.query(
        "update app.deliveries set status='cancelled',failure_code='destination_suppressed',updated_at=now() where channel=$1 and destination_hash=$2 and status in ('queued','claimed')",
        [channel, destinationHash],
      );
    });
  }
  async suppressContact(contactId: string, reason: string): Promise<void> {
    const contact = await this.database.withService(
      async (sql) =>
        (
          await sql.query<{ channel: Channel; destination_hash: string }>(
            "select channel,destination_hash from app.contacts where id=$1",
            [contactId],
          )
        ).rows[0],
    );
    if (contact) await this.suppressDestination(contact.channel, contact.destination_hash, reason);
  }

  async setPhoneChallenge(
    userId: string,
    challenge: { phone: string; challengeId: string; expiresAt: string },
  ): Promise<void> {
    await this.database.withService(async (sql) => {
      requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for update`,
            [userId],
          )
        ).rows[0],
      );
      await sql.query(
        "insert into app.phone_challenges(user_id,phone,challenge_id,expires_at) values($1,$2,$3,$4) on conflict(user_id) do update set phone=excluded.phone,challenge_id=excluded.challenge_id,expires_at=excluded.expires_at,created_at=now()",
        [userId, challenge.phone, challenge.challengeId, challenge.expiresAt],
      );
    });
  }
  getPhoneChallenge(
    userId: string,
  ): Promise<{ phone: string; challengeId: string; expiresAt: string } | null> {
    return this.database.withService(async (sql) => {
      const row = (
        await sql.query<{ phone: string; challengeId: string; expiresAt: string }>(
          'select phone,challenge_id as "challengeId",expires_at as "expiresAt" from app.phone_challenges where user_id=$1',
          [userId],
        )
      ).rows[0];
      return row ? { ...row, expiresAt: iso(row.expiresAt) } : null;
    });
  }
  async clearPhoneChallenge(userId: string): Promise<void> {
    await this.database.withService(async (sql) => {
      await sql.query("delete from app.phone_challenges where user_id=$1", [userId]);
    });
  }

  /** Call only after the provider confirms this exact challenge. A newer challenge cannot be consumed. */
  async completePhoneChallenge(
    userId: string,
    challengeId: string,
    destinationHash: string,
  ): Promise<ContactRecord> {
    return this.database.withService(async (sql) => {
      requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for update`,
            [userId],
          )
        ).rows[0],
      );
      const challenge = (
        await sql.query<{ phone: string }>(
          "delete from app.phone_challenges where user_id=$1 and challenge_id=$2 and expires_at>now() returning phone",
          [userId, challengeId],
        )
      ).rows[0];
      if (!challenge)
        throw new RepositoryError(
          "challenge_expired",
          "Verification expired or was replaced. Request a new code.",
        );
      await sql.query(
        "insert into app.contacts(user_id,channel,value,destination_hash,verified_at) values($1,'sms',$2,$3,now()) on conflict(user_id,channel) do update set value=excluded.value,destination_hash=excluded.destination_hash,verified_at=now(),version=app.contacts.version+1,updated_at=now()",
        [userId, challenge.phone, destinationHash],
      );
      return (await this.contacts(sql, userId)).find((contact) => contact.channel === "sms")!;
    });
  }

  async consumeRateLimit({
    key,
    limit,
    windowSeconds,
  }: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      !Number.isSafeInteger(windowSeconds) ||
      windowSeconds < 1
    )
      throw new RepositoryError("invalid_limit", "Invalid rate limit");
    return this.database.withService(async (sql) => {
      const row = (
        await sql.query<{ count: number }>(
          `insert into app.rate_limits(bucket_key,window_started_at,count) values($1,now(),1) on conflict(bucket_key) do update set window_started_at=case when app.rate_limits.window_started_at<=now()-make_interval(secs=>$3) then now() else app.rate_limits.window_started_at end,count=case when app.rate_limits.window_started_at<=now()-make_interval(secs=>$3) then 1 else app.rate_limits.count+1 end where app.rate_limits.window_started_at<=now()-make_interval(secs=>$3) or app.rate_limits.count<$2 returning count`,
          [key, limit, windowSeconds],
        )
      ).rows[0];
      return !!row;
    });
  }

  async listProfiles(
    cursor?: string | null,
    limit = 100,
  ): Promise<{ items: ProfileRecord[]; nextCursor: string | null }> {
    return this.database.withService(async (sql) => {
      const rows = (
        await sql.query<ProfileRecord>(
          `select ${profileColumns} from app.profiles where not deleting and ($1::uuid is null or user_id>$1::uuid) order by user_id limit $2`,
          [cursor ?? null, boundedLimit(limit) + 1],
        )
      ).rows;
      const items = rows.slice(0, boundedLimit(limit));
      return { items, nextCursor: rows.length > items.length ? items.at(-1)!.userId : null };
    });
  }
  getJobCursor(jobName: string): Promise<string | null> {
    return this.database.withService(
      async (sql) =>
        (
          await sql.query<{ cursor: string | null }>(
            "select cursor from app.job_cursors where job_name=$1",
            [jobName],
          )
        ).rows[0]?.cursor ?? null,
    );
  }
  async setJobCursor(jobName: string, cursor: string | null): Promise<void> {
    await this.database.withService(async (sql) => {
      await sql.query(
        "insert into app.job_cursors(job_name,cursor) values($1,$2) on conflict(job_name) do update set cursor=excluded.cursor,updated_at=now()",
        [jobName, cursor],
      );
    });
  }

  async createCheckout(
    userId: string,
    amountCents: number,
    operationId: string,
  ): Promise<CheckoutRecord> {
    positiveCents(amountCents);
    return this.database.withService(async (sql) => {
      requireProfile(
        (
          await sql.query<ProfileRecord>(
            `select ${profileColumns} from app.profiles where user_id=$1 for update`,
            [userId],
          )
        ).rows[0],
      );
      const wallet = (
        await sql.query<WalletRecord>(
          `select ${walletColumns} from app.wallets where user_id=$1 for update`,
          [userId],
        )
      ).rows[0];
      if (!wallet || wallet.blockedReason)
        throw new RepositoryError(
          "wallet_blocked",
          "This wallet requires support review before a purchase",
        );
      await sql.query(
        "insert into app.checkout_intents(id,wallet_id,amount_cents) values($1,$2,$3) on conflict(id) do nothing",
        [operationId, wallet.id, amountCents],
      );
      const checkout = (
        await sql.query<CheckoutRecord>(
          `select ${checkoutColumns} from app.checkout_intents where id=$1`,
          [operationId],
        )
      ).rows[0];
      if (checkout.walletId !== wallet.id || checkout.amountCents !== amountCents)
        throw new RepositoryError(
          "checkout_conflict",
          "Purchase operation ID has conflicting details",
        );
      return checkout;
    });
  }
  getCheckout(checkoutId: string): Promise<(CheckoutRecord & { userId: string | null }) | null> {
    return this.database.withService(async (sql) => {
      const checkout = (
        await sql.query<CheckoutRecord>(
          `select ${checkoutColumns} from app.checkout_intents where id=$1`,
          [checkoutId],
        )
      ).rows[0];
      if (!checkout) return null;
      const wallet = (
        await sql.query<{ user_id: string | null }>("select user_id from app.wallets where id=$1", [
          checkout.walletId,
        ])
      ).rows[0];
      return { ...checkout, userId: wallet.user_id };
    });
  }
  async attachCheckoutSession(checkoutId: string, providerSessionId: string): Promise<void> {
    await this.database.withService(async (sql) => {
      const row = (
        await sql.query<{ id: string }>(
          "update app.checkout_intents set provider_session_id=$2,updated_at=now() where id=$1 and (provider_session_id is null or provider_session_id=$2) returning id",
          [checkoutId, providerSessionId],
        )
      ).rows[0];
      if (!row)
        throw new RepositoryError(
          "checkout_conflict",
          "Checkout session does not match the stored purchase",
        );
    });
  }
  async expireCheckout(checkoutId: string, providerSessionId: string): Promise<void> {
    await this.database.withService(async (sql) => {
      const checkout = (
        await sql.query<CheckoutRecord>(
          `select ${checkoutColumns} from app.checkout_intents where id=$1 for update`,
          [checkoutId],
        )
      ).rows[0];
      if (!checkout) throw new RepositoryError("checkout_not_found", "Purchase record not found");
      if (checkout.providerSessionId && checkout.providerSessionId !== providerSessionId) {
        throw new RepositoryError(
          "checkout_conflict",
          "Checkout session does not match the stored purchase",
        );
      }
      // A verified webhook can arrive before the create request attaches its provider response.
      await sql.query(
        "update app.checkout_intents set status='expired',provider_session_id=$2,updated_at=now() where id=$1 and status='pending'",
        [checkoutId, providerSessionId],
      );
    });
  }
  async fundCheckout(input: {
    checkoutId: string;
    providerSessionId: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
    eventId: string;
  }): Promise<{ funded: boolean; wallet: WalletRecord }> {
    positiveCents(input.amountCents);
    return this.database.withService(async (sql) => {
      await sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `payment:${input.paymentIntentId}`,
      ]);
      const initial = (
        await sql.query<CheckoutRecord>(
          `select ${checkoutColumns} from app.checkout_intents where id=$1`,
          [input.checkoutId],
        )
      ).rows[0];
      if (!initial) throw new RepositoryError("checkout_not_found", "Purchase record not found");
      await sql.query("select id from app.wallets where id=$1 for update", [initial.walletId]);
      const checkout = (
        await sql.query<CheckoutRecord>(
          `select ${checkoutColumns} from app.checkout_intents where id=$1 for update`,
          [input.checkoutId],
        )
      ).rows[0];
      if (
        checkout.amountCents !== input.amountCents ||
        checkout.currency !== input.currency ||
        (checkout.providerSessionId && checkout.providerSessionId !== input.providerSessionId) ||
        (checkout.paymentIntentId && checkout.paymentIntentId !== input.paymentIntentId)
      )
        throw new RepositoryError("payment_mismatch", "Payment does not match its stored purchase");
      if (checkout.status === "cancelled")
        throw new RepositoryError("checkout_cancelled", "Cancelled purchase needs reconciliation");
      const funded = checkout.status !== "paid";
      if (funded) {
        await sql.query(
          "update app.checkout_intents set status='paid',provider_session_id=$2,payment_intent_id=$3,updated_at=now() where id=$1",
          [checkout.id, input.providerSessionId, input.paymentIntentId],
        );
        await sql.query("update app.wallets set available_cents=available_cents+$2 where id=$1", [
          checkout.walletId,
          checkout.amountCents,
        ]);
        await sql.query(
          "insert into app.credit_ledger(wallet_id,kind,amount_cents,available_delta,reserved_delta,idempotency_key) values($1,'fund',$2,$2,0,$3)",
          [checkout.walletId, checkout.amountCents, `fund:${checkout.id}`],
        );
      }
      // A refund/dispute webhook may precede its checkout-completed webhook.
      const incident = (
        await sql.query<{ kind: string }>(
          "select kind from app.financial_events where payment_intent_id=$1 order by created_at limit 1",
          [input.paymentIntentId],
        )
      ).rows[0];
      if (incident)
        await sql.query("update app.wallets set blocked_reason=$2 where id=$1", [
          checkout.walletId,
          `payment_${incident.kind}`,
        ]);
      const wallet = (
        await sql.query<WalletRecord>(`select ${walletColumns} from app.wallets where id=$1`, [
          checkout.walletId,
        ])
      ).rows[0];
      return { funded, wallet };
    });
  }

  async restrictWalletByPaymentIntent(input: {
    paymentIntentId: string;
    eventId: string;
    kind: "refund" | "dispute";
    amountCents: number;
  }): Promise<void> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
      throw new RepositoryError("invalid_amount", "Invalid financial event amount");
    await this.database.withService(async (sql) => {
      await sql.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `payment:${input.paymentIntentId}`,
      ]);
      const checkout = (
        await sql.query<CheckoutRecord>(
          `select ${checkoutColumns} from app.checkout_intents where payment_intent_id=$1`,
          [input.paymentIntentId],
        )
      ).rows[0];
      if (checkout)
        await sql.query("select id from app.wallets where id=$1 for update", [checkout.walletId]);
      await sql.query(
        "insert into app.financial_events(wallet_id,provider_event_id,payment_intent_id,kind,amount_cents) values($1,$2,$3,$4,$5) on conflict(provider_event_id) do nothing",
        [
          checkout?.walletId ?? null,
          input.eventId,
          input.paymentIntentId,
          input.kind,
          input.amountCents,
        ],
      );
      const existing = (
        await sql.query<{ payment_intent_id: string; kind: string; amount_cents: number }>(
          "select payment_intent_id,kind,amount_cents from app.financial_events where provider_event_id=$1",
          [input.eventId],
        )
      ).rows[0];
      if (
        existing.payment_intent_id !== input.paymentIntentId ||
        existing.kind !== input.kind ||
        existing.amount_cents !== input.amountCents
      )
        throw new RepositoryError("event_conflict", "Financial event ID has conflicting data");
      if (checkout)
        await sql.query("update app.wallets set blocked_reason=$2 where id=$1", [
          checkout.walletId,
          `payment_${input.kind}`,
        ]);
    });
  }

  reserveCredits(
    userId: string,
    deliveryId: string,
    amountCents: number,
    sql?: SqlExecutor,
  ): Promise<ReservationRecord> {
    positiveCents(amountCents);
    const operation = async (connection: SqlExecutor): Promise<ReservationRecord> => {
      const wallet = (
        await connection.query<WalletRecord>(
          `select ${walletColumns} from app.wallets where user_id=$1 for update`,
          [userId],
        )
      ).rows[0];
      if (!wallet) throw new RepositoryError("not_found", "Wallet record not found");
      const existing = (
        await connection.query<ReservationRecord>(
          `select ${reservationColumns} from app.credit_reservations where delivery_id=$1 for update`,
          [deliveryId],
        )
      ).rows[0];
      if (existing) {
        if (existing.walletId !== wallet.id || existing.amountCents !== amountCents)
          throw new RepositoryError("reservation_conflict", "Reservation details do not match");
        if (existing.status === "released" || existing.status === "waived")
          throw new RepositoryError(
            "reservation_released",
            "Released or waived delivery cannot reserve again",
          );
        return existing;
      }
      const delivery = (
        await connection.query<{ user_id: string; channel: string; status: string }>(
          "select user_id,channel,status from app.deliveries where id=$1",
          [deliveryId],
        )
      ).rows[0];
      if (
        !delivery ||
        delivery.user_id !== userId ||
        delivery.channel !== "sms" ||
        !["queued", "claimed", "sending"].includes(delivery.status)
      )
        throw new RepositoryError("invalid_delivery", "Cannot reserve for this delivery");
      if (wallet.blockedReason)
        throw new RepositoryError("wallet_blocked", "SMS purchases require support review");
      if (wallet.availableCents < amountCents)
        throw new RepositoryError("insufficient_funds", "Insufficient SMS balance");
      const reservation = (
        await connection.query<ReservationRecord>(
          `insert into app.credit_reservations(wallet_id,delivery_id,amount_cents) values($1,$2,$3) returning ${reservationColumns}`,
          [wallet.id, deliveryId, amountCents],
        )
      ).rows[0];
      await connection.query(
        "update app.wallets set available_cents=available_cents-$2,reserved_cents=reserved_cents+$2 where id=$1",
        [wallet.id, amountCents],
      );
      await connection.query(
        "insert into app.credit_ledger(wallet_id,kind,amount_cents,available_delta,reserved_delta,idempotency_key) values($1,'reserve',$2::integer,-($2::integer),$2::integer,$3)",
        [wallet.id, amountCents, `reserve:${deliveryId}`],
      );
      return reservation;
    };
    return sql ? operation(sql) : this.database.withService(operation);
  }
  settleCredits(deliveryId: string, sql?: SqlExecutor): Promise<ReservationRecord | null> {
    return this.finishReservation(deliveryId, "settled", sql);
  }
  releaseCredits(deliveryId: string, sql?: SqlExecutor): Promise<ReservationRecord | null> {
    return this.finishReservation(deliveryId, "released", sql);
  }
  private finishReservation(
    deliveryId: string,
    status: "settled" | "released",
    sql?: SqlExecutor,
  ): Promise<ReservationRecord | null> {
    const operation = async (connection: SqlExecutor): Promise<ReservationRecord | null> => {
      const initial = (
        await connection.query<ReservationRecord>(
          `select ${reservationColumns} from app.credit_reservations where delivery_id=$1`,
          [deliveryId],
        )
      ).rows[0];
      if (!initial) return null;
      await connection.query("select id from app.wallets where id=$1 for update", [
        initial.walletId,
      ]);
      const reservation = (
        await connection.query<ReservationRecord>(
          `select ${reservationColumns} from app.credit_reservations where delivery_id=$1 for update`,
          [deliveryId],
        )
      ).rows[0];
      if (reservation.status === status || reservation.status === "waived") return reservation;
      if (reservation.status !== "held")
        throw new RepositoryError(
          "reservation_final",
          "This reservation already has a different final state",
        );
      const refund = status === "released" ? reservation.amountCents : 0;
      await connection.query(
        "update app.wallets set available_cents=available_cents+$2,reserved_cents=reserved_cents-$3 where id=$1",
        [reservation.walletId, refund, reservation.amountCents],
      );
      await connection.query(
        "update app.credit_reservations set status=$2,updated_at=now() where id=$1",
        [reservation.id, status],
      );
      await connection.query(
        "insert into app.credit_ledger(wallet_id,kind,amount_cents,available_delta,reserved_delta,idempotency_key) values($1,$2,$3::integer,$4,-($3::integer),$5)",
        [
          reservation.walletId,
          status === "released" ? "release" : "settle",
          reservation.amountCents,
          refund,
          `${status}:${deliveryId}`,
        ],
      );
      return { ...reservation, status };
    };
    return sql ? operation(sql) : this.database.withService(operation);
  }

  async listLedger(
    userId: string,
    options: { cursor?: string | null; limit?: number } = {},
  ): Promise<Page<LedgerRecord>> {
    return this.database.withUser(userId, async (sql) => {
      const limit = boundedLimit(options.limit);
      const cursor = decodeCursor(options.cursor);
      const rows = (
        await sql.query<LedgerRecord>(
          `select l.id,l.kind,l.amount_cents as "amountCents",l.created_at as "createdAt" from app.credit_ledger l join app.wallets w on w.id=l.wallet_id where w.user_id=$1 and ($2::timestamptz is null or (l.created_at,l.id)<($2::timestamptz,$3::uuid)) order by l.created_at desc,l.id desc limit $4`,
          [userId, cursor?.date ?? null, cursor?.id ?? null, limit + 1],
        )
      ).rows;
      const total = Number(
        (
          await sql.query<{ total: string }>(
            "select count(*) as total from app.credit_ledger l join app.wallets w on w.id=l.wallet_id where w.user_id=$1",
            [userId],
          )
        ).rows[0].total,
      );
      const items = rows.slice(0, limit).map((row) => ({ ...row, createdAt: iso(row.createdAt) }));
      const last = items.at(-1);
      const hasMore = rows.length > limit;
      return {
        items,
        total,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      };
    });
  }

  async recordWebhook(
    provider: string,
    eventId: string,
    payloadHash: string,
  ): Promise<{ processed: boolean }> {
    return this.database.withService(async (sql) => {
      await sql.query(
        "insert into app.webhook_receipts(provider,event_id,payload_hash) values($1,$2,$3) on conflict do nothing",
        [provider, eventId, payloadHash],
      );
      const row = (
        await sql.query<{ payload_hash: string; status: string }>(
          "select payload_hash,status from app.webhook_receipts where provider=$1 and event_id=$2",
          [provider, eventId],
        )
      ).rows[0];
      if (row.payload_hash !== payloadHash)
        throw new RepositoryError("event_conflict", "Webhook event ID has conflicting data");
      return { processed: row.status === "processed" };
    });
  }
  async completeWebhook(provider: string, eventId: string): Promise<void> {
    await this.database.withService(async (sql) => {
      await sql.query(
        "update app.webhook_receipts set status='processed',processed_at=now() where provider=$1 and event_id=$2",
        [provider, eventId],
      );
    });
  }

  async prepareAccountDeletion(userId: string): Promise<void> {
    await this.database.withService(async (sql) => {
      const profile = (
        await sql.query<ProfileRecord>(
          `select ${profileColumns} from app.profiles where user_id=$1 for update`,
          [userId],
        )
      ).rows[0];
      if (!profile) return;
      if (profile.deleting) return;
      const wallet = (
        await sql.query<WalletRecord>(
          `select ${walletColumns} from app.wallets where user_id=$1 for update`,
          [userId],
        )
      ).rows[0];
      if (!wallet) throw new RepositoryError("not_found", "Wallet record not found");
      const pending = (
        await sql.query<{ exists: boolean }>(
          "select exists(select 1 from app.checkout_intents where wallet_id=$1 and status='pending')",
          [wallet.id],
        )
      ).rows[0].exists;
      const unresolved = (
        await sql.query<{ exists: boolean }>(
          "select exists(select 1 from app.deliveries d where d.user_id=$1 and d.status in ('sending','submitted','unknown') and not (d.status='unknown' and d.channel='sms' and exists(select 1 from app.credit_reservations r where r.delivery_id=d.id and r.wallet_id=$2 and r.status='waived')))",
          [userId, wallet.id],
        )
      ).rows[0].exists;
      if (
        wallet.availableCents ||
        wallet.reservedCents ||
        wallet.blockedReason ||
        pending ||
        unresolved
      )
        throw new RepositoryError(
          "account_financial_review",
          "Resolve remaining funds, pending payments or deliveries with support before deleting your account",
        );
      await sql.query(
        "update app.profiles set deleting=true,version=version+1,schedule=jsonb_set(schedule,'{paused}','true'::jsonb),updated_at=now() where user_id=$1",
        [userId],
      );
      await sql.query(
        "update app.deliveries set status='cancelled',failure_code='account_deleting',updated_at=now() where user_id=$1 and status in ('queued','claimed')",
        [userId],
      );
      await sql.query(
        "insert into app.consent_events(user_id,channel,destination_hash,granted,wording_version,reason) select user_id,channel,destination_hash,false,'account-deletion','account-deletion' from app.contacts where user_id=$1",
        [userId],
      );
      await sql.query(
        "insert into app.suppressions(channel,destination_hash,reason) select channel,destination_hash,'unsubscribe' from app.contacts where user_id=$1 on conflict do nothing",
        [userId],
      );
    });
  }

  /** All owner records, not the paginated dashboard bootstrap. Caller must apply an export response-size policy. */
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    return this.database.withUser(userId, async (sql) => {
      const profile = (
        await sql.query<ProfileRecord>(
          `select ${profileColumns} from app.profiles where user_id=$1 for share`,
          [userId],
        )
      ).rows[0];
      if (!profile) throw new RepositoryError("not_found", "Account record not found");
      const saved = (
        await sql.query(
          "select practice_id,created_at from app.saved_practices where user_id=$1 order by created_at,practice_id",
          [userId],
        )
      ).rows;
      const completions = (
        await sql.query(
          "select id,practice_id,to_char(local_date,'YYYY-MM-DD') as local_date,created_at from app.completions where user_id=$1 order by local_date,id",
          [userId],
        )
      ).rows;
      const notes = (
        await sql.query(
          "select practice_id,body,updated_at from app.notes where user_id=$1 order by practice_id",
          [userId],
        )
      ).rows;
      const contacts = await this.contacts(sql, userId);
      const consent = (
        await sql.query(
          "select id,channel,granted,wording_version,reason,created_at from app.consent_events where user_id=$1 order by sequence",
          [userId],
        )
      ).rows;
      const deliveries = (
        await sql.query(
          "select id,channel,practice_id,content_version,scheduled_at,status,created_at,updated_at from app.deliveries where user_id=$1 order by created_at,id",
          [userId],
        )
      ).rows;
      const wallet = (
        await sql.query<WalletRecord>(`select ${walletColumns} from app.wallets where user_id=$1`, [
          userId,
        ])
      ).rows[0];
      const ledger = (
        await sql.query(
          "select l.id,l.kind,l.amount_cents,l.available_delta,l.reserved_delta,l.created_at from app.credit_ledger l join app.wallets w on w.id=l.wallet_id where w.user_id=$1 order by l.created_at,l.id",
          [userId],
        )
      ).rows;
      return {
        exportedAt: new Date().toISOString(),
        profile,
        saved,
        completions,
        notes,
        contacts,
        consent,
        deliveries,
        wallet,
        ledger,
      };
    });
  }
}
