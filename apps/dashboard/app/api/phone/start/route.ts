import { phoneSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { phoneVerificationEnabled, ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { twilio } from "@/lib/server/providers";
import { rateLimit, repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const user = await requireUser();
  const { phone } = await body(request, phoneSchema);
  if (!phoneVerificationEnabled())
    throw new ServiceError("UNAVAILABLE", "Phone verification is not available yet.", 503);
  await rateLimit(`verify:global`, 50, 3600);
  await rateLimit(`verify:user:${user.id}`, 3, 3600);
  await rateLimit(`verify:phone:${phone}`, 3, 3600);
  const provider = twilio();
  const lookup = await provider.lookupCanadianPhone(phone);
  if (!lookup.valid)
    throw new ServiceError("VALIDATION", "Use a valid Canadian mobile number, including +1.");
  const result = await provider.startVerification(lookup.phone);
  if (result.outcome !== "accepted")
    throw new ServiceError(
      "UNAVAILABLE",
      "We couldn't confirm that a code was sent. Please wait before trying again.",
      503,
    );
  await repository().setPhoneChallenge(user.id, {
    phone: lookup.phone,
    challengeId: result.providerId,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  return json({ sent: true });
});
