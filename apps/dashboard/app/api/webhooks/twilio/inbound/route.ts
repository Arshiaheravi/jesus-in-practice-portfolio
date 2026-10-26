import { createHash } from "node:crypto";

import { digestIdentifier } from "@jesus-in-practice/backend/tokens";

import { origin, secret } from "@/lib/server/config";
import { boundedText, route } from "@/lib/server/http";
import { twilio } from "@/lib/server/providers";
import { database, repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const raw = await boundedText(request, 32_768);
  const fields = twilio().verifyWebhook({
    rawBody: raw,
    signature: request.headers.get("x-twilio-signature") ?? "",
    url: `${origin()}/api/webhooks/twilio/inbound`,
  });
  const hash = createHash("sha256").update(raw).digest("hex");
  const repo = repository();
  if (!(await repo.recordWebhook("twilio-inbound", hash, hash)).processed) {
    if (/^\+1\d{10}$/.test(fields.From ?? "")) {
      const digest = digestIdentifier(secret("DESTINATION_HASH_SECRET"), `sms:${fields.From}`);
      const optOut = fields.OptOutType?.toUpperCase();
      if (
        optOut === "STOP" ||
        /^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(fields.Body?.trim() ?? "")
      )
        await repo.suppressDestination("sms", digest, "sms_stop");
      // START only lifts the carrier suppression. Product consent remains withdrawn until a new explicit opt-in.
      else if (optOut === "START")
        await database().withService(async (sql) => {
          await sql.query(
            "delete from app.suppressions where channel='sms' and destination_hash=$1 and reason='sms_stop'",
            [digest],
          );
        });
    }
    await repo.completeWebhook("twilio-inbound", hash);
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    headers: { "Content-Type": "text/xml" },
  });
});
