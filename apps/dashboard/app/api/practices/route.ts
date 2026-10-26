import { catalogQuerySchema, readCatalog } from "@jesus-in-practice/backend/content-catalog";

import { requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { contentRepository } from "@/lib/server/content";
import { json, route } from "@/lib/server/http";
import { rateLimit, repository } from "@/lib/server/runtime";

export const GET = route(async (request) => {
  const user = await requireUser();
  await rateLimit(`catalog:read:${user.id}`, 180, 60);
  const params = new URL(request.url).searchParams;
  const parsed = catalogQuerySchema.safeParse({
    source: params.get("source") ?? undefined,
    topics: params.get("topics")?.split(",").filter(Boolean) ?? [],
    q: params.get("q") ?? "",
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!parsed.success) throw new ServiceError("VALIDATION", "Choose valid practice filters.", 400);
  const ids = params.get("ids")?.split(",");
  if (ids && (ids.length > 100 || ids.some((id) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))))
    throw new ServiceError("VALIDATION", "Request at most 100 valid practice IDs.", 400);
  const saved = params.get("saved") === "true" ? (await repository().getState(user.id)).saved : ids;
  return json(await readCatalog(contentRepository(), parsed.data, saved));
});
