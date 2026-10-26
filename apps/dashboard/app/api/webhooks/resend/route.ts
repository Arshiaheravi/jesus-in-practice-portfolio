import { createHash } from "node:crypto";

import { DeliveryStore } from "@jesus-in-practice/backend/operational";
import { digestIdentifier } from "@jesus-in-practice/backend/tokens";
import { emailSchema } from "@jesus-in-practice/backend/validation";

import { secret } from "@/lib/server/config";
import { boundedText, json, route } from "@/lib/server/http";
import { resend } from "@/lib/server/providers";
import { repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const raw = await boundedText(request, 262_144);
  const eventId = request.headers.get("svix-id") ?? "";
  const event = resend().verifyWebhook(raw, {
    id: eventId,
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  });
  const repo = repository();
  if (
    (await repo.recordWebhook("resend", eventId, createHash("sha256").update(raw).digest("hex")))
      .processed
  )
    return json({ received: true });
  const data = event.data as {
    email_id?: string;
    to?: unknown;
    tags?: Record<string, string> | { name: string; value: string }[];
  };
  if (
    ["email.bounced", "email.complained", "email.suppressed"].includes(event.type) &&
    Array.isArray(data.to)
  ) {
    // Provider suppression must survive deletion of the original account and delivery row.
    for (const recipient of data.to.slice(0, 50)) {
      const email = emailSchema.safeParse(recipient);
      if (email.success)
        await repo.suppressDestination(
          "email",
          digestIdentifier(secret("DESTINATION_HASH_SECRET"), `email:${email.data}`),
          event.type,
        );
    }
  }
  if (data.email_id) {
    const store = new DeliveryStore(repo);
    const tag = Array.isArray(data.tags)
      ? data.tags.find((item) => item.name === "delivery_id")?.value
      : data.tags?.delivery_id;
    const delivery =
      tag && /^[a-f0-9-]{36}$/i.test(tag)
        ? await store.get(tag)
        : await store.findByProvider("email", data.email_id);
    if (delivery?.channel === "email") {
      if (event.type === "email.delivered")
        await store.finish(delivery.id, "delivered", data.email_id);
      else if (
        ["email.bounced", "email.complained", "email.suppressed", "email.failed"].includes(
          event.type,
        )
      ) {
        if (["email.bounced", "email.complained", "email.suppressed"].includes(event.type))
          await repo.suppressDestination("email", delivery.destinationHash, event.type);
        await store.finish(delivery.id, "failed", data.email_id, event.type);
      } else if (event.type === "email.sent")
        await store.finish(delivery.id, "submitted", data.email_id);
    }
  }
  await repo.completeWebhook("resend", eventId);
  return json({ received: true });
});
