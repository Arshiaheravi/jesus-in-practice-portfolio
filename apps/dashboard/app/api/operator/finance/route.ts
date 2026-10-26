import { FinancialOperations } from "@jesus-in-practice/backend/financial-operations";
import { z } from "@jesus-in-practice/backend/validation";

import { ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { requireOperator } from "@/lib/server/operator";
import { stripe } from "@/lib/server/providers";
import { rateLimit, repository } from "@/lib/server/runtime";

const reason = z.string().trim().min(10).max(500);
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("refund"),
      operationId: z.uuid(),
      checkoutId: z.uuid(),
      amountCents: z.number().int().min(1).max(5000),
      reason,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("resolve"),
      operationId: z.uuid(),
      paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]{1,200}$/),
      reason,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel-refund"),
      refundId: z.uuid(),
      reason,
      confirmed: z.literal(true),
    })
    .strict(),
]);
export const maxDuration = 60;
export const GET = route(async (request) => {
  const actor = await requireOperator(["admin", "support"]);
  await rateLimit(`operator:read:${actor.user.id}`, 100, 60);
  const id = new URL(request.url).searchParams.get("id");
  if (!z.uuid().safeParse(id).success)
    throw new ServiceError("VALIDATION", "Enter a valid refund request ID.");
  const refund = await new FinancialOperations(repository(), stripe()).getRefund(id!);
  return json({
    refund: refund
      ? {
          id: refund.id,
          status: refund.status,
          holdState: refund.holdState,
          amountCents: refund.amountCents,
        }
      : null,
  });
});
export const POST = route(async (request) => {
  const input = await body(request, schema);
  const actor = await requireOperator(["admin"], { recentMfa: true });
  await rateLimit(`operator:finance:${actor.user.id}`, 10, 600);
  const operations = new FinancialOperations(repository(), stripe(8_000));
  if (input.action === "cancel-refund")
    return json({
      refund: await operations.cancelAbsentRefund({ ...input, actorId: actor.user.id }),
    });
  if (input.action === "refund") {
    const refund = await operations.requestRefund({ ...input, actorId: actor.user.id });
    // Durable outbox-style request. The maintenance worker contacts Stripe after commit.
    return json(
      {
        refund: {
          id: refund.id,
          status: refund.status,
          holdState: refund.holdState,
          amountCents: refund.amountCents,
        },
      },
      202,
    );
  }
  return json({
    resolution: await operations.resolveIncident({ ...input, actorId: actor.user.id }),
  });
});
