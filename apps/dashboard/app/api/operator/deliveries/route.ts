import { DeliverySupport } from "@jesus-in-practice/backend/delivery-support";
import { z } from "@jesus-in-practice/backend/validation";

import { body, json, route } from "@/lib/server/http";
import { requireOperator } from "@/lib/server/operator";
import { rateLimit, repository } from "@/lib/server/runtime";
const schema = z
  .object({
    operationId: z.uuid(),
    deliveryId: z.uuid(),
    reason: z.string().trim().min(10).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const POST = route(async (request) => {
  const input = await body(request, schema);
  const actor = await requireOperator(["admin"], { recentMfa: true });
  await rateLimit(`operator:waiver:${actor.user.id}`, 10, 600);
  const result = await new DeliverySupport(repository(), {
    commercePolicyApproved: process.env.COMMERCE_POLICY_APPROVED === "true",
  }).waiveUnknownDelivery({ ...input, actorId: actor.user.id });
  return json({ waiver: result });
});
