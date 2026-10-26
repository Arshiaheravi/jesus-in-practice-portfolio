import { createHash } from "node:crypto";

import { FinancialOperations } from "@jesus-in-practice/backend/financial-operations";

import { ServiceError } from "@/lib/server/config";
import { boundedText, json, route } from "@/lib/server/http";
import { stripe } from "@/lib/server/providers";
import { repository } from "@/lib/server/runtime";

export const POST = route(async (request) => {
  const raw = await boundedText(request, 262_144);
  const provider = stripe();
  const event = provider.verifyWebhook(raw, request.headers.get("stripe-signature") ?? "");
  const repo = repository();
  const finances = new FinancialOperations(repo, provider);
  if (
    (await repo.recordWebhook("stripe", event.id, createHash("sha256").update(raw).digest("hex")))
      .processed
  )
    return json({ received: true });
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const fundingId = session.metadata?.fundingId;
      if (!fundingId || !/^[a-f0-9-]{36}$/i.test(fundingId)) break; // An unrelated Stripe checkout is not app credit.
      const intent = await repo.getCheckout(fundingId);
      if (!intent?.userId)
        throw new ServiceError("RECONCILIATION_REQUIRED", "Payment needs reconciliation.", 503);
      const funding = await provider.retrieveFunding({
        sessionId: session.id,
        fundingId,
        userId: intent.userId,
        amountCents: intent.amountCents,
      });
      if (funding.status === "paid" && funding.paymentIntentId)
        await repo.fundCheckout({
          checkoutId: fundingId,
          providerSessionId: funding.sessionId,
          paymentIntentId: funding.paymentIntentId,
          amountCents: funding.amountCents,
          currency: funding.currency,
          eventId: event.id,
        });
      else if (
        funding.status === "failed" ||
        event.type === "checkout.session.async_payment_failed"
      )
        await repo.expireCheckout(fundingId, funding.sessionId);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      if (charge.currency !== "cad") break;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (paymentIntentId)
        await finances.handleChargeRefundEvent({
          paymentIntentId,
          eventId: event.id,
          amountCents: charge.amount_refunded,
        });
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const paymentIntentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
      if (paymentIntentId)
        await repo.restrictWalletByPaymentIntent({
          paymentIntentId,
          eventId: event.id,
          kind: "dispute",
          amountCents: dispute.amount,
        });
      break;
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      const refund = event.data.object;
      const result = await finances.handleRefundEvent(refund.id, event.id);
      const paymentIntentId =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id;
      if (!result.matched && paymentIntentId)
        await repo.restrictWalletByPaymentIntent({
          paymentIntentId,
          eventId: event.id,
          kind: "refund",
          amountCents: refund.amount,
        });
      break;
    }
  }
  await repo.completeWebhook("stripe", event.id);
  return json({ received: true });
});
