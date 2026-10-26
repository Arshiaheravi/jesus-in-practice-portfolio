import { z } from "@jesus-in-practice/backend/validation";

import { ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { requireOperator } from "@/lib/server/operator";
import { rateLimit } from "@/lib/server/runtime";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }).strict(),
  z
    .object({ action: z.literal("verify"), factorId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
    .strict(),
]);
export const GET = route(async () => {
  const actor = await requireOperator(undefined, { allowSetup: true });
  const { data, error } = await actor.client.auth.mfa.listFactors();
  if (error)
    throw new ServiceError(
      "UNAVAILABLE",
      "Authenticator settings are temporarily unavailable.",
      503,
    );
  return json({
    role: actor.role,
    verified: actor.verified,
    recentMfa: actor.recentMfa,
    factors: data.totp
      .filter((f) => f.status === "verified")
      .map((f) => ({ id: f.id, name: f.friendly_name || "Authenticator" })),
  });
});
export const POST = route(async (request) => {
  const input = await body(request, command);
  const actor = await requireOperator(undefined, { allowSetup: true });
  await rateLimit(`operator:mfa:${actor.user.id}`, 8, 600);
  const { data, error } = await actor.client.auth.mfa.listFactors();
  if (error)
    throw new ServiceError(
      "UNAVAILABLE",
      "Authenticator settings are temporarily unavailable.",
      503,
    );
  if (input.action === "enroll") {
    if (data.totp.some((f) => f.status === "verified"))
      throw new ServiceError(
        "MFA_EXISTS",
        "Use your existing authenticator. Recovery requires the account owner.",
        409,
      );
    // Only abandoned unverified enrolments can be replaced at AAL1.
    for (const factor of data.all.filter(
      (f) => f.factor_type === "totp" && f.status === "unverified",
    )) {
      const removed = await actor.client.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error)
        throw new ServiceError(
          "UNAVAILABLE",
          "An earlier setup could not be cleared. Try again later.",
          503,
        );
    }
    const result = await actor.client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Jesus in Practice operator",
      issuer: "Jesus in Practice",
    });
    if (result.error)
      throw new ServiceError("UNAVAILABLE", "Authenticator setup could not start.", 503);
    return json({
      factorId: result.data.id,
      secret: result.data.totp.secret,
      qrCode: result.data.totp.qr_code,
    });
  }
  if (!data.all.some((f) => f.id === input.factorId && f.factor_type === "totp"))
    throw new ServiceError("VALIDATION", "Select your authenticator again.");
  const result = await actor.client.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: input.code,
  });
  if (result.error)
    throw new ServiceError(
      "INVALID_CODE",
      "That code could not be verified. Enter the current code from your authenticator.",
      400,
    );
  return json({ verified: true });
});
