import { authStartSchema } from "@jesus-in-practice/backend/validation";

import { authClient } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { authRateLimits } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const { email } = await body(request, authStartSchema);
  await authRateLimits(request, email);
  const client = await authClient();
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error && error.status && error.status >= 500)
    throw new ServiceError(
      "UNAVAILABLE",
      "Sign-in emails are temporarily unavailable. Please try again later.",
      503,
    );
  // Do not reveal whether an address already has an account or is blocked.
  return json({
    sent: true,
    message: "If this address can receive a sign-in code, it will arrive shortly.",
  });
});
