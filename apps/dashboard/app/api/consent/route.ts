import { consentVersion } from "@jesus-in-practice/backend/contracts";
import { consentSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { operator, ServiceError, smsRate } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { rateLimit, repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const user = await requireUser();
  const { channel, enabled, consentVersion: displayedVersion } = await body(request, consentSchema);
  if (enabled) operator(); // Do not collect consent to an unidentified operator.
  if (enabled && channel === "sms" && !smsRate())
    throw new ServiceError(
      "UNAVAILABLE",
      "SMS pricing must be available before enabling SMS reminders.",
      503,
    );
  const currentVersion = consentVersion(channel, smsRate());
  if (enabled && displayedVersion !== currentVersion)
    throw new ServiceError(
      "CONSENT_CHANGED",
      "The reminder terms or SMS price changed. Review the updated information before enabling reminders again.",
      409,
    );
  await rateLimit(`consent:${user.id}`, 30, 3600);
  await repository().setConsent(user.id, channel, enabled, currentVersion);
  return json({ ok: true });
});
