import { constantEqual } from "@jesus-in-practice/backend/tokens";

import { secret, ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { runWorker } from "@/lib/server/worker";

export const maxDuration = 60;
export const POST = route(async (request) => {
  if (!constantEqual(request.headers.get("authorization") ?? "", `Bearer ${secret("CRON_SECRET")}`))
    throw new ServiceError("FORBIDDEN", "Request not authorized.", 403);
  return json(await runWorker());
});
