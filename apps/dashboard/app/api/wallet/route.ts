import { cursorSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { bootstrap } from "@/lib/server/member";
import { repository } from "@/lib/server/runtime";

export const GET = route(async (request) => {
  const user = await requireUser();
  const cursor = cursorSchema.safeParse(
    new URL(request.url).searchParams.get("cursor") ?? undefined,
  );
  if (!cursor.success) throw new ServiceError("VALIDATION", "Invalid wallet cursor.");
  const [member, page] = await Promise.all([
    bootstrap(user),
    repository().listLedger(user.id, { cursor: cursor.data }),
  ]);
  return json({ ...member.wallet, entries: page.items, nextCursor: page.nextCursor });
});
