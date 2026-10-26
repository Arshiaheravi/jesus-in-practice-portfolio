import { cursorSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { repository } from "@/lib/server/runtime";

export const GET = route(async (request) => {
  const user = await requireUser();
  const result = cursorSchema.safeParse(
    new URL(request.url).searchParams.get("cursor") ?? undefined,
  );
  if (!result.success) throw new ServiceError("VALIDATION", "Invalid history cursor.");
  const data = await repository().listHistory(user.id, { cursor: result.data });
  return json({
    items: data.items.map((item) => ({
      id: item.practiceId,
      date: item.localDate,
      recordId: item.id,
    })),
    nextCursor: data.nextCursor,
    total: data.total,
  });
});
