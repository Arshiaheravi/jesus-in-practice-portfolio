import Stripe from "stripe";

import {
  InvalidWebhookError,
  nonempty,
  opaqueId,
  ProviderTimeoutError,
  providerStatus,
  sendFailure,
  type SendResult,
  trustedUrl,
  withDeadline,
} from "./types.ts";

export interface StripeProviderConfig {
  secretKey: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
  liveMode: boolean;
  timeoutMs?: number;
}

export interface StripePort {
  createSession: (
    parameters: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Stripe.Checkout.Session>;
  retrieveSession: (id: string) => Promise<Stripe.Checkout.Session>;
  listSessions?: (
    parameters: Stripe.Checkout.SessionListParams,
  ) => Promise<Stripe.ApiList<Stripe.Checkout.Session>>;
  createRefund?: (
    parameters: Stripe.RefundCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Stripe.Refund>;
  retrieveRefund?: (id: string) => Promise<Stripe.Refund>;
  listRefunds?: (parameters: Stripe.RefundListParams) => Promise<Stripe.ApiList<Stripe.Refund>>;
  retrievePaymentIntent?: (id: string) => Promise<Stripe.PaymentIntent>;
  listDisputes?: (parameters: Stripe.DisputeListParams) => Promise<Stripe.ApiList<Stripe.Dispute>>;
}

export interface RefundEvidence {
  id: string;
  paymentIntentId: string;
  operationId: string | null;
  amountCents: number;
  currency: string;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
}
export interface FinancialEvidence {
  paymentIntentId: string;
  amountCents: number;
  currency: "cad";
  refunds: RefundEvidence[];
  disputes: { id: string; amountCents: number; status: string }[];
  complete: boolean;
}
export interface RefundInput {
  operationId: string;
  paymentIntentId: string;
  amountCents: number;
}

export interface FundingInput {
  fundingId: string;
  userId: string;
  amountCents: number;
}

export function createStripeProvider(config: StripeProviderConfig, injectedPort?: StripePort) {
  nonempty(config.secretKey, "Stripe secret key");
  nonempty(config.webhookSecret, "Stripe webhook secret");
  const successUrl = trustedUrl(config.successUrl).href;
  const cancelUrl = trustedUrl(config.cancelUrl).href;
  const timeout = config.timeoutMs ?? 15_000;
  const sdk = new Stripe(config.secretKey, { timeout, maxNetworkRetries: 2 });
  const port: StripePort = injectedPort ?? {
    createSession: (parameters, options) => sdk.checkout.sessions.create(parameters, options),
    retrieveSession: (id) => sdk.checkout.sessions.retrieve(id),
    listSessions: (parameters) => sdk.checkout.sessions.list(parameters),
    createRefund: (parameters, options) => sdk.refunds.create(parameters, options),
    retrieveRefund: (id) => sdk.refunds.retrieve(id),
    listRefunds: (parameters) => sdk.refunds.list(parameters),
    retrievePaymentIntent: (id) => sdk.paymentIntents.retrieve(id),
    listDisputes: (parameters) => sdk.disputes.list(parameters),
  };

  function refundEvidence(refund: Stripe.Refund): RefundEvidence {
    const paymentIntentId =
      typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    if (
      !paymentIntentId ||
      !Number.isSafeInteger(refund.amount) ||
      refund.amount <= 0 ||
      !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(
        refund.status ?? "",
      )
    )
      throw new Error("STRIPE_REFUND_INVALID");
    return {
      id: refund.id,
      paymentIntentId,
      operationId: refund.metadata?.operationId ?? null,
      amountCents: refund.amount,
      currency: refund.currency,
      status: refund.status as RefundEvidence["status"],
    };
  }
  function requireMethod<T>(method: T | undefined): T {
    if (!method) throw new Error("Stripe financial method is not configured");
    return method;
  }

  function validateFunding(input: FundingInput) {
    opaqueId(input.fundingId);
    opaqueId(input.userId);
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 50) {
      throw new Error("Funding amount must be integer CAD cents, at least 50.");
    }
  }

  return {
    async createRefund(
      input: RefundInput,
    ): Promise<
      { outcome: "accepted"; refund: RefundEvidence } | Exclude<SendResult, { outcome: "accepted" }>
    > {
      opaqueId(input.operationId);
      opaqueId(input.paymentIntentId);
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
        throw new Error("Invalid refund amount");
      try {
        const refund = await withDeadline(
          () =>
            requireMethod(port.createRefund)(
              {
                payment_intent: input.paymentIntentId,
                amount: input.amountCents,
                reason: "requested_by_customer",
                metadata: { operationId: input.operationId },
              },
              { idempotencyKey: `sms-refund/${input.operationId}`, timeout, maxNetworkRetries: 2 },
            ),
          timeout,
        );
        const evidence = refundEvidence(refund);
        if (
          evidence.paymentIntentId !== input.paymentIntentId ||
          evidence.operationId !== input.operationId ||
          evidence.amountCents !== input.amountCents ||
          evidence.currency !== "cad"
        )
          throw new Error("STRIPE_REFUND_MISMATCH");
        return { outcome: "accepted" as const, refund: evidence };
      } catch (error) {
        if (
          providerStatus(error) === 409 ||
          (error &&
            typeof error === "object" &&
            "type" in error &&
            error.type === "StripeIdempotencyError")
        )
          return { outcome: "unknown", code: "STRIPE_REFUND_IN_PROGRESS" };
        return sendFailure(error, "STRIPE_REFUND") as Exclude<SendResult, { outcome: "accepted" }>;
      }
    },

    async retrieveRefund(id: string) {
      opaqueId(id);
      return refundEvidence(
        await withDeadline(() => requireMethod(port.retrieveRefund)(id), timeout),
      );
    },

    /** Complete evidence is required before changing credit or clearing an incident. */
    async financialEvidence(paymentIntentId: string, maximumPages = 3): Promise<FinancialEvidence> {
      opaqueId(paymentIntentId);
      if (!Number.isSafeInteger(maximumPages))
        throw new Error("Invalid Stripe history page budget");
      const pages = Math.max(1, Math.min(5, maximumPages));
      const deadline = Date.now() + timeout;
      const read = <T>(operation: () => Promise<T>): Promise<T> => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new ProviderTimeoutError();
        return withDeadline(operation, remaining);
      };
      const payment = await read(() => requireMethod(port.retrievePaymentIntent)(paymentIntentId));
      if (
        payment.id !== paymentIntentId ||
        payment.currency !== "cad" ||
        payment.livemode !== config.liveMode ||
        payment.status !== "succeeded" ||
        !Number.isSafeInteger(payment.amount_received) ||
        payment.amount_received <= 0
      )
        throw new Error("STRIPE_PAYMENT_MISMATCH");
      const refunds: RefundEvidence[] = [];
      const disputes: FinancialEvidence["disputes"] = [];
      let complete = true;
      for (const kind of ["refunds", "disputes"] as const) {
        let cursor: string | undefined;
        for (let page = 0; page < pages; page++) {
          const parameters = {
            payment_intent: paymentIntentId,
            limit: 100,
            ...(cursor ? { starting_after: cursor } : {}),
          };
          const result =
            kind === "refunds"
              ? await read(() => requireMethod(port.listRefunds)(parameters))
              : await read(() => requireMethod(port.listDisputes)(parameters));
          for (const item of result.data) {
            const owner =
              typeof item.payment_intent === "string"
                ? item.payment_intent
                : item.payment_intent?.id;
            if (owner !== paymentIntentId || item.currency !== "cad")
              throw new Error("STRIPE_PAYMENT_MISMATCH");
            if (kind === "refunds") refunds.push(refundEvidence(item as Stripe.Refund));
            else {
              const dispute = item as Stripe.Dispute;
              if (
                dispute.livemode !== config.liveMode ||
                !Number.isSafeInteger(dispute.amount) ||
                dispute.amount <= 0
              )
                throw new Error("STRIPE_PAYMENT_MISMATCH");
              disputes.push({
                id: dispute.id,
                amountCents: dispute.amount,
                status: dispute.status,
              });
            }
          }
          if (!result.has_more) break;
          cursor = result.data.at(-1)?.id;
          if (!cursor || page === pages - 1) {
            complete = false;
            break;
          }
        }
      }
      if (
        new Set(refunds.map((row) => row.id)).size !== refunds.length ||
        new Set(disputes.map((row) => row.id)).size !== disputes.length
      )
        complete = false;
      return {
        paymentIntentId,
        amountCents: payment.amount_received,
        currency: "cad",
        refunds,
        disputes,
        complete,
      };
    },

    /** One bounded page; callers persist the cursor and validate the matching session separately. */
    async listFundingSessions(input: {
      createdAfter: number;
      createdBefore: number;
      cursor?: string | null;
    }) {
      const result = await withDeadline(
        () =>
          requireMethod(port.listSessions)({
            created: { gte: input.createdAfter, lte: input.createdBefore },
            limit: 100,
            ...(input.cursor ? { starting_after: input.cursor } : {}),
          }),
        timeout,
      );
      return {
        items: result.data
          .filter((session) => session.livemode === config.liveMode)
          .map((session) => ({ id: session.id, fundingId: session.metadata?.fundingId ?? null })),
        hasMore: result.has_more,
        nextCursor: result.has_more ? (result.data.at(-1)?.id ?? null) : null,
      };
    },

    async createCheckout(input: FundingInput) {
      validateFunding(input);
      try {
        const session = await withDeadline(
          () =>
            port.createSession(
              {
                mode: "payment",
                allowed_payment_method_types: ["card"],
                success_url: successUrl,
                cancel_url: cancelUrl,
                client_reference_id: input.userId,
                metadata: { fundingId: input.fundingId, userId: input.userId },
                payment_intent_data: {
                  metadata: { fundingId: input.fundingId, userId: input.userId },
                },
                line_items: [
                  {
                    quantity: 1,
                    price_data: {
                      currency: "cad",
                      unit_amount: input.amountCents,
                      product_data: { name: "Jesus in Practice SMS service credit" },
                    },
                  },
                ],
              },
              { idempotencyKey: `sms-funding/${input.fundingId}`, timeout, maxNetworkRetries: 2 },
            ),
          timeout,
        );
        if (!session.id || !session.url || session.livemode !== config.liveMode) {
          return { outcome: "unknown" as const, code: "STRIPE_INVALID_RESPONSE" };
        }
        // Stripe's hosted Checkout URL can include provider-owned client state in its fragment.
        const url = trustedUrl(session.url, { allowFragment: true });
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") {
          return { outcome: "unknown" as const, code: "STRIPE_INVALID_CHECKOUT_URL" };
        }
        return {
          outcome: "accepted" as const,
          providerId: session.id,
          sessionId: session.id,
          url: url.href,
          status: "pending",
        };
      } catch (error) {
        return sendFailure(error, "STRIPE");
      }
    },

    async retrieveFunding(input: FundingInput & { sessionId: string }) {
      validateFunding(input);
      if (!/^cs_[A-Za-z0-9_]{1,240}$/.test(input.sessionId))
        throw new Error("Invalid Checkout session identifier.");
      const session = await withDeadline(() => port.retrieveSession(input.sessionId), timeout);
      if (
        session.id !== input.sessionId ||
        session.mode !== "payment" ||
        session.currency !== "cad" ||
        session.amount_total !== input.amountCents ||
        session.client_reference_id !== input.userId ||
        session.metadata?.userId !== input.userId ||
        session.metadata?.fundingId !== input.fundingId ||
        session.livemode !== config.liveMode
      ) {
        throw new Error("STRIPE_FUNDING_MISMATCH");
      }
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
      if (session.payment_status === "paid" && !paymentIntentId)
        throw new Error("STRIPE_MISSING_PAYMENT");
      return {
        status:
          session.payment_status === "paid"
            ? ("paid" as const)
            : session.status === "expired"
              ? ("failed" as const)
              : ("pending" as const),
        sessionId: session.id,
        paymentIntentId,
        amountCents: input.amountCents,
        currency: "cad" as const,
      };
    },

    verifyWebhook(rawBody: string, signature: string): Stripe.Event {
      try {
        const event = sdk.webhooks.constructEvent(rawBody, signature, config.webhookSecret, 300);
        if (event.livemode !== config.liveMode) throw new Error("Incorrect environment.");
        return event;
      } catch {
        throw new InvalidWebhookError();
      }
    },
  };
}
