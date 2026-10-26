import { digestIdentifier } from "@jesus-in-practice/backend/tokens";
import { phoneVerifySchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { phoneVerificationEnabled, secret, ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { twilio } from "@/lib/server/providers";
import { rateLimit, repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const user = await requireUser();
  const { code } = await body(request, phoneVerifySchema);
  if (!phoneVerificationEnabled())
    throw new ServiceError("UNAVAILABLE", "Phone verification is not available yet.", 503);
  await rateLimit(`verify:check:${user.id}`, 8, 600);
  const repo = repository();
  const challenge = await repo.getPhoneChallenge(user.id);
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now())
    throw new ServiceError("INVALID_CODE", "Request a new phone verification code.");
  const result = await twilio().checkVerification(challenge.phone, code);
  if (
    result.outcome === "unknown" ||
    (result.outcome === "rejected" &&
      ["VERIFY_RATE_LIMIT", "VERIFY_REJECTED"].includes(result.code))
  )
    throw new ServiceError(
      "UNAVAILABLE",
      "We couldn't confirm that code with the phone service. Please wait and try again.",
      503,
    );
  if (result.outcome !== "approved" || result.providerId !== challenge.challengeId)
    throw new ServiceError("INVALID_CODE", "That code is incorrect or has expired.");
  await repo.completePhoneChallenge(
    user.id,
    challenge.challengeId,
    digestIdentifier(secret("DESTINATION_HASH_SECRET"), `sms:${result.phone}`),
  );
  return json({ ok: true });
});
