import "server-only";

import { createDatabase } from "@jesus-in-practice/backend/database";
import { BackendRepository } from "@jesus-in-practice/backend/repository";
import { digestIdentifier } from "@jesus-in-practice/backend/tokens";

import { required, secret, ServiceError } from "./config";

let instance: ReturnType<typeof createDatabase> | undefined;
export function database() {
  if (!instance) {
    instance = createDatabase(required("DATABASE_URL"), {
      max: 5,
      ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
    });
  }
  return instance;
}
export function repository() {
  return new BackendRepository(database());
}
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const allowed = await repository().consumeRateLimit({
    key: digestIdentifier(secret("RATE_LIMIT_SECRET"), key),
    limit,
    windowSeconds,
  });
  if (!allowed) throw new ServiceError("RATE_LIMIT", "Please wait before trying again.", 429);
}
export async function authRateLimits(request: Request, email: string, verify = false) {
  await rateLimit(`auth:global:${verify ? "verify" : "start"}`, verify ? 500 : 100, 3600);
  await rateLimit(
    `auth:${verify ? "verify" : "start"}:${email}`,
    verify ? 8 : 3,
    verify ? 600 : 3600,
  );
  // Configure only a header overwritten by the deployment edge; never trust arbitrary forwarded headers.
  const edgeHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
  const address = edgeHeader && request.headers.get(edgeHeader);
  if (address) await rateLimit(`auth:ip:${address}`, verify ? 30 : 10, 3600);
}
