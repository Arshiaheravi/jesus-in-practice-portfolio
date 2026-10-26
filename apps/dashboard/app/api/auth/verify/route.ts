import { authVerifySchema } from "@jesus-in-practice/backend/validation";

import { authClient } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { authRateLimits } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const { email, code } = await body(request, authVerifySchema);
  await authRateLimits(request, email, true);
  const client = await authClient();
  const { error, data } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user)
    throw new ServiceError(
      "INVALID_CODE",
      "That code is incorrect or has expired. Request a new code and try again.",
      400,
    );
  return json({ ok: true });
});
