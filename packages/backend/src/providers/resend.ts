import {
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  Resend,
} from "resend";

import {
  InvalidWebhookError,
  nonempty,
  opaqueId,
  sendFailure,
  type SendResult,
  trustedUrl,
  withDeadline,
} from "./types.ts";

export interface ResendProviderConfig {
  apiKey: string;
  webhookSecret: string;
  from: string;
  replyTo: string;
  timeoutMs?: number;
}

export interface ResendPort {
  send: (
    parameters: CreateEmailOptions,
    options: CreateEmailRequestOptions,
  ) => Promise<CreateEmailResponse>;
}

export interface EmailDelivery {
  deliveryId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

export function createResendProvider(config: ResendProviderConfig, injectedPort?: ResendPort) {
  nonempty(config.apiKey, "Resend API key");
  nonempty(config.webhookSecret, "Resend webhook secret");
  nonempty(config.from, "Email sender");
  nonempty(config.replyTo, "Support email");
  const timeout = config.timeoutMs ?? 15_000;
  const sdk = new Resend(config.apiKey);
  const port: ResendPort = injectedPort ?? {
    send: (parameters, options) => sdk.emails.send(parameters, options),
  };
  return {
    async send(input: EmailDelivery): Promise<SendResult> {
      opaqueId(input.deliveryId);
      if (
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.to) ||
        /[\r\n]/.test(input.subject) ||
        !input.html ||
        !input.text
      ) {
        return { outcome: "rejected", code: "EMAIL_INVALID_MESSAGE", retryable: false };
      }
      const unsubscribe = trustedUrl(input.unsubscribeUrl).href;
      try {
        const response = await withDeadline(
          () =>
            port.send(
              {
                from: config.from,
                replyTo: config.replyTo,
                to: [input.to],
                subject: input.subject,
                html: input.html,
                text: input.text,
                headers: {
                  "List-Unsubscribe": `<${unsubscribe}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
                tags: [{ name: "delivery_id", value: input.deliveryId }],
              },
              {
                idempotencyKey: `lesson/${input.deliveryId}`,
                signal: AbortSignal.timeout(timeout),
              },
            ),
          timeout,
        );
        if (response.error) {
          if (response.error.name === "concurrent_idempotent_requests") {
            return { outcome: "unknown", code: "RESEND_IN_PROGRESS" };
          }
          if (response.error.name === "invalid_idempotent_request") {
            return { outcome: "rejected", code: "RESEND_IDEMPOTENCY_CONFLICT", retryable: false };
          }
          return sendFailure(response.error, "RESEND");
        }
        if (!response.data?.id) return { outcome: "unknown", code: "RESEND_INVALID_RESPONSE" };
        return { outcome: "accepted", providerId: response.data.id, status: "accepted" };
      } catch (error) {
        return sendFailure(error, "RESEND");
      }
    },

    verifyWebhook(rawBody: string, headers: { id: string; timestamp: string; signature: string }) {
      try {
        return sdk.webhooks.verify({
          payload: rawBody,
          headers,
          webhookSecret: config.webhookSecret,
        });
      } catch {
        throw new InvalidWebhookError();
      }
    },
  };
}
