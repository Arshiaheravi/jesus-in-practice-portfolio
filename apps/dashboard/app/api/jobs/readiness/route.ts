import { constantEqual } from "@jesus-in-practice/backend/tokens";

import { secret, ServiceError } from "@/lib/server/config";
import { json, route } from "@/lib/server/http";
import { serviceReadiness } from "@/lib/server/operations";
export const GET = route(async (request) => {
  if (
    !constantEqual(
      request.headers.get("authorization") ?? "",
      `Bearer ${secret("MONITORING_SECRET")}`,
    )
  )
    throw new ServiceError("FORBIDDEN", "Request not authorized.", 403);
  const result = await serviceReadiness();
  return json(result, result.ready ? 200 : 503);
});
