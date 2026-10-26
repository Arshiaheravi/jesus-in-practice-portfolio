import { json, route } from "@/lib/server/http";
import { serviceReadiness } from "@/lib/server/operations";
import { requireOperator } from "@/lib/server/operator";
import { rateLimit } from "@/lib/server/runtime";
export const GET = route(async () => {
  const actor = await requireOperator();
  await rateLimit(`operator:overview:${actor.user.id}`, 20, 60);
  return json(await serviceReadiness());
});
