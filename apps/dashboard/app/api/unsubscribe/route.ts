import { readUnsubscribeToken } from "@jesus-in-practice/backend/tokens";
import { NextResponse } from "next/server";

import { origin, secret, ServiceError } from "@/lib/server/config";
import { boundedText, json, route } from "@/lib/server/http";
import { repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const decoded = readUnsubscribeToken(secret("UNSUBSCRIBE_SIGNING_SECRET"), token);
  if (!decoded)
    throw new ServiceError(
      "INVALID_LINK",
      "This unsubscribe link is invalid or expired. Contact support for help.",
    );
  await boundedText(request, 2048);
  await repository().suppressDestination(decoded.channel, decoded.destinationHash, "unsubscribe");
  if (request.headers.get("accept")?.includes("text/html"))
    return NextResponse.redirect(`${origin()}/unsubscribe?complete=1`, 303);
  return json({ ok: true, message: "Your practice messages for this channel are turned off." });
});
