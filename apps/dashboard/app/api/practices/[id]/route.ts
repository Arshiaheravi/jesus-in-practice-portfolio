import { getPractice } from "@jesus-in-practice/content";

import { requireUser } from "@/lib/server/auth";
import { ServiceError } from "@/lib/server/config";
import { contentRepository } from "@/lib/server/content";
import { json, route } from "@/lib/server/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireUser();
    const { id } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))
      throw new ServiceError("NOT_FOUND", "Practice not found.", 404);
    const practice = getPractice(id) ?? (await contentRepository().getPublished(id));
    if (!practice)
      throw new ServiceError(
        "NOT_FOUND",
        "This practice is no longer published. Your saved records are retained.",
        404,
      );
    return json({ practice });
  })(request);
}
