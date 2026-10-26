import { OperatorRepository } from "@jesus-in-practice/backend/operators";
import { z } from "@jesus-in-practice/backend/validation";

import { ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { requireOperator } from "@/lib/server/operator";
import { database, rateLimit } from "@/lib/server/runtime";

export const GET = route(async (request) => {
  const actor = await requireOperator(["admin", "support"]);
  await rateLimit(`operator:read:${actor.user.id}`, 100, 60);
  const params = new URL(request.url).searchParams;
  const walletId = params.get("wallet");
  if (walletId) {
    if (!z.uuid().safeParse(walletId).success)
      throw new ServiceError("VALIDATION", "Enter a valid wallet identifier.");
    return json(await new OperatorRepository(database()).wallet(actor.user.id, walletId));
  }
  const cursor = params.get("cursor");
  if (
    cursor &&
    !z
      .string()
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .safeParse(cursor).success
  )
    throw new ServiceError("VALIDATION", "The page cursor is invalid.");
  return json(await new OperatorRepository(database()).cases(actor.user.id, cursor ?? undefined));
});
