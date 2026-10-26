import { checkoutSchema } from "@jesus-in-practice/backend/validation";

import { requireUser } from "@/lib/server/auth";
import { checkoutEnabled, ServiceError } from "@/lib/server/config";
import { body, json, route } from "@/lib/server/http";
import { stripe } from "@/lib/server/providers";
import { rateLimit, repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const user = await requireUser();
  const { amountCents, operationId } = await body(request, checkoutSchema);
  if (!checkoutEnabled())
    throw new ServiceError(
      "UNAVAILABLE",
      "SMS payments are not available yet. Email and your account remain free.",
      503,
    );
  await rateLimit(`checkout:${user.id}`, 12, 3600);
  const repo = repository();
  const intent = await repo.createCheckout(user.id, amountCents, operationId);
  if (intent.status !== "pending")
    throw new ServiceError(
      "CONFLICT",
      "This payment attempt is already finished. Refresh your wallet before starting another.",
      409,
    );
  if (Date.now() - new Date(intent.createdAt).getTime() > 23 * 3_600_000)
    throw new ServiceError(
      "CONFLICT",
      "This payment attempt needs reconciliation. Contact support before retrying.",
      409,
    );
  const result = await stripe().createCheckout({
    fundingId: intent.id,
    userId: user.id,
    amountCents: intent.amountCents,
  });
  if (result.outcome !== "accepted" || !("sessionId" in result) || !("url" in result))
    throw new ServiceError(
      "UNAVAILABLE",
      "Checkout could not be confirmed. Retry this same payment attempt before starting another.",
      503,
    );
  await repo.attachCheckoutSession(intent.id, result.sessionId);
  return json({ url: result.url });
});
