import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { consentVersion } from "@jesus-in-practice/backend/contracts";
import { renderPracticeEmail, renderPracticeSms } from "@jesus-in-practice/backend/messages";
import { DeliveryStore, type FrozenPayload } from "@jesus-in-practice/backend/operational";
import { dueOccurrences } from "@jesus-in-practice/backend/schedule";
import { unsubscribeToken } from "@jesus-in-practice/backend/tokens";

import { operator, origin, required, secret, sendingEnabled, smsRate } from "./config";
import { contentRepository } from "./content";
import { resend, twilio } from "./providers";
import { database, repository } from "./runtime";

export async function runWorker() {
  const repo = repository();
  const store = new DeliveryStore(repo);
  const content = contentRepository();
  const token = randomUUID();
  const acquired = await database().withService(
    async (sql) =>
      (
        await sql.query(
          "insert into app.worker_leases(name,token,expires_at) values('delivery',$1,now()+interval '90 seconds') on conflict(name) do update set token=excluded.token,expires_at=excluded.expires_at where app.worker_leases.expires_at<now() returning name",
          [token],
        )
      ).rows.length > 0,
  );
  if (!acquired) return { busy: true };
  const started = Date.now();
  const stats = { planned: 0, processed: 0, unknown: 0, failed: 0, planningPending: false };
  try {
    await store.claim(1, []); // Expire abandoned work even while new sending is disabled.
    const canReconcile = [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_VERIFY_SERVICE_SID",
      "TWILIO_MESSAGING_SERVICE_SID",
    ].every((key) => !!process.env[key]);
    if (canReconcile) {
      for (const delivery of await store.unresolved(2)) {
        try {
          const result = await twilio(5_000).getMessage(delivery.providerId!);
          if (result.status === "delivered")
            await store.finish(delivery.id, "delivered", result.sid);
          else if (["failed", "undelivered", "canceled"].includes(result.status))
            await store.finish(delivery.id, "failed", result.sid, "provider_terminal_failure");
        } catch {
          /* A failed lookup is not delivery evidence. */
        } finally {
          await store.reconciled(delivery.id);
        }
      }
    }
    let cursor = await repo.getJobCursor("plan-deliveries");
    do {
      const page = await repo.listProfiles(cursor, 50);
      for (const profile of page.items) {
        const due = dueOccurrences({
          userId: profile.userId,
          revision: profile.deliveryVersion,
          preferences: profile.preferences,
          schedule: profile.schedule,
          now: new Date(),
          updatedAt: new Date(profile.deliveryUpdatedAt),
        });
        for (const occurrence of due) {
          for (const channel of ["email", "sms"] as const) {
            if (
              !sendingEnabled(channel) ||
              ![channel, "both"].includes(profile.preferences.channel)
            )
              continue;
            const practice = await content.selectForDelivery(
              profile.preferences,
              occurrence.key,
              channel,
            );
            if (!practice) continue;
            const contact = await store.context(profile.userId, channel);
            if (!contact || contact.consentVersion !== consentVersion(channel, smsRate())) continue;
            const unsubscribeUrl = `${origin()}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(secret("UNSUBSCRIBE_SIGNING_SECRET"), contact.contactId, channel, contact.destinationHash))}`;
            let payload: FrozenPayload;
            if (channel === "email") {
              const message = renderPracticeEmail(practice, {
                ...operator(),
                unsubscribeUrl,
                practiceUrl:
                  "versionId" in practice
                    ? `${origin()}/practice/${practice.id}`
                    : `${required("NEXT_PUBLIC_SITE_URL")}/practices/${practice.id}`,
              });
              payload = {
                to: contact.value,
                localDate: occurrence.date,
                quoteCents: 0,
                rateCents: 0,
                segments: 0,
                ...message,
                unsubscribeUrl: unsubscribeUrl.replace("/unsubscribe?", "/api/unsubscribe?"),
              };
              // Body links go to the confirmation page; RFC8058 headers use a direct POST endpoint.
            } else {
              const rate = smsRate();
              if (!rate) continue;
              let message;
              try {
                message = renderPracticeSms(practice, {
                  senderName: operator().senderName,
                  informationUrl: `${required("NEXT_PUBLIC_SITE_URL")}/support`,
                  maxSegments: 10,
                });
              } catch {
                stats.failed++;
                continue;
              } // Never truncate references or quietly send a higher-priced message.
              payload = {
                to: contact.value,
                localDate: occurrence.date,
                quoteCents: message.segments * rate,
                rateCents: rate,
                segments: message.segments,
                body: message.body,
              };
            }
            const id = await store.enqueue({
              userId: profile.userId,
              occurrenceKey: occurrence.key,
              channel,
              practiceId: practice.id,
              contentVersion:
                "versionId" in practice
                  ? practice.versionId
                  : createHash("sha256").update(JSON.stringify(practice)).digest("hex"),
              profileVersion: profile.deliveryVersion,
              context: contact,
              payload,
              scheduledAt: occurrence.at,
              expiresAt: new Date(occurrence.at.getTime() + 10 * 60_000),
            });
            if (id) stats.planned++;
          }
        }
        cursor = profile.userId;
        if (Date.now() - started > 12_000) {
          stats.planningPending = true;
          break;
        }
      }
      if (!stats.planningPending) cursor = page.nextCursor;
      await repo.setJobCursor("plan-deliveries", cursor);
      if (!cursor || stats.planningPending) break;
    } while (Date.now() - started < 12_000);

    const enabledChannels = (["email", "sms"] as const).filter(sendingEnabled);
    let lastSubmission = 0;
    while (Date.now() - started < 40_000 && enabledChannels.length) {
      const deliveries = await store.claim(5, enabledChannels);
      if (!deliveries.length) break;
      for (const claimed of deliveries) {
        if (Date.now() - started > 40_000) break; // Unstarted leases can be reclaimed safely.
        if (!sendingEnabled(claimed.channel)) continue;
        const delay = Math.max(0, 600 - (Date.now() - lastSubmission));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const delivery = await store.begin(claimed.id, claimed.claimToken!, smsRate(), {
          allowPublished: process.env.CONTENT_RIGHTS_ENABLED === "true",
        });
        if (!delivery) continue;
        const budget = await repo.consumeRateLimit({
          key: `send-budget:${delivery.channel}`,
          limit: 100,
          windowSeconds: 86_400,
        });
        if (!budget) {
          await store.finish(delivery.id, "failed", undefined, "operator_daily_budget");
          stats.failed++;
          continue;
        }
        try {
          lastSubmission = Date.now();
          const result =
            delivery.channel === "sms"
              ? await twilio().sendSms({
                  deliveryId: delivery.id,
                  to: delivery.payload.to,
                  body: delivery.payload.body!,
                })
              : await resend().send({
                  deliveryId: delivery.id,
                  to: delivery.payload.to,
                  subject: delivery.payload.subject!,
                  html: delivery.payload.html!,
                  text: delivery.payload.text!,
                  unsubscribeUrl: delivery.payload.unsubscribeUrl!,
                });
          if (result.outcome === "accepted")
            await store.finish(delivery.id, "submitted", result.providerId);
          else {
            await store.finish(
              delivery.id,
              result.outcome === "unknown" ? "unknown" : "failed",
              undefined,
              result.code,
            );
            if (result.outcome === "unknown") stats.unknown++;
            else stats.failed++;
            if (result.code === "TWILIO_OPTED_OUT")
              await repo.suppressDestination("sms", delivery.destinationHash, "sms_stop");
          }
        } catch {
          // The process may have lost a response after acceptance. Do not re-send or release a possibly billable hold.
          await store.finish(delivery.id, "unknown", undefined, "provider_outcome_unknown");
          stats.unknown++;
        }
        stats.processed++;
      }
    }
    return stats;
  } finally {
    await database().withService(async (sql) => {
      await sql.query("delete from app.worker_leases where name='delivery' and token=$1", [token]);
    });
  }
}
