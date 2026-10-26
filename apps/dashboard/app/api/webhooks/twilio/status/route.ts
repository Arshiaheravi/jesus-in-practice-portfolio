import { createHash } from "node:crypto";

import { DeliveryStore } from "@jesus-in-practice/backend/operational";

import { origin, ServiceError } from "@/lib/server/config";
import { boundedText, route } from "@/lib/server/http";
import { twilio } from "@/lib/server/providers";
import { repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const raw = await boundedText(request, 32_768);
  const query = new URL(request.url).search;
  const fields = twilio().verifyWebhook({
    rawBody: raw,
    signature: request.headers.get("x-twilio-signature") ?? "",
    url: `${origin()}/api/webhooks/twilio/status${query}`,
  });
  const id = new URL(request.url).searchParams.get("deliveryId") ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^SM[a-zA-Z0-9]{32}$/.test(fields.MessageSid ?? ""))
    throw new ServiceError("VALIDATION", "Invalid delivery event.");
  const hash = createHash("sha256").update(`${id}:${raw}`).digest("hex");
  const repo = repository();
  if (!(await repo.recordWebhook("twilio", hash, hash)).processed) {
    const store = new DeliveryStore(repo);
    const delivery = await store.get(id);
    if (delivery?.channel === "sms" && fields.To === delivery.payload.to) {
      const status = fields.MessageStatus;
      if (status === "delivered") await store.finish(id, "delivered", fields.MessageSid);
      else if (["failed", "undelivered", "canceled"].includes(status))
        await store.finish(id, "failed", fields.MessageSid, `twilio_${fields.ErrorCode || status}`);
      else if (["accepted", "queued", "sending", "sent"].includes(status))
        await store.finish(id, "submitted", fields.MessageSid);
      if (fields.ErrorCode === "21610")
        await repo.suppressDestination("sms", delivery.destinationHash, "sms_stop");
    }
    await repo.completeWebhook("twilio", hash);
  }
  return new Response(null, { status: 204 });
});
