import { authClient } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { assertOrigin, json, route } from "@/lib/server/http";

export const POST = route(async (request) => {
  assertOrigin(request);
  const client = await authClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error)
    throw new ServiceError(
      "UNAVAILABLE",
      "Sign-out could not be confirmed. Please try again.",
      503,
    );
  return json({ ok: true });
});
