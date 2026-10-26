import "server-only";

import {
  OperatorRepository,
  type OperatorRole,
  operatorRoles,
} from "@jesus-in-practice/backend/operators";

import { authClient } from "./auth";
import { ServiceError } from "./config";
import { database } from "./runtime";

export async function requireOperator(
  allowed: OperatorRole[] = operatorRoles,
  options: { allowSetup?: boolean; recentMfa?: boolean } = {},
) {
  const client = await authClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user?.email_confirmed_at)
    throw new ServiceError("AUTH_REQUIRED", "Sign in again to continue.", 401);
  const { data: tokenData, error: tokenError } = await client.auth.getClaims();
  if (tokenError || !tokenData || tokenData.claims.sub !== userData.user.id)
    throw new ServiceError("AUTH_REQUIRED", "Sign in again to continue.", 401);
  const role = await new OperatorRepository(database()).role(userData.user.id, allowed);
  const claims = tokenData.claims;
  const methods = Array.isArray(claims.amr) ? claims.amr : [];
  const now = Math.floor(Date.now() / 1000);
  const recentMfa = methods.some(
    (method) =>
      typeof method === "object" &&
      method !== null &&
      "method" in method &&
      method.method === "totp" &&
      "timestamp" in method &&
      typeof method.timestamp === "number" &&
      method.timestamp <= now + 30 &&
      now - method.timestamp <= 900,
  );
  if (!options.allowSetup && (claims.aal !== "aal2" || (options.recentMfa && !recentMfa)))
    throw new ServiceError("MFA_REQUIRED", "Verify your authenticator to continue.", 403);
  return { client, user: userData.user, role, verified: claims.aal === "aal2", recentMfa };
}
