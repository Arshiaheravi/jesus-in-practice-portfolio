import twilio from "twilio";

import { enforceSmsLimit } from "../sms.ts";
import {
  InvalidWebhookError,
  nonempty,
  opaqueId,
  providerStatus,
  sendFailure,
  type SendResult,
  trustedUrl,
  withDeadline,
} from "./types.ts";

export interface TwilioProviderConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  authToken: string;
  verifyServiceSid: string;
  messagingServiceSid: string;
  publicWebhookBaseUrl: string;
  statusCallbackPath?: string;
  inboundWebhookPath?: string;
  timeoutMs?: number;
}

interface Verification {
  sid: string;
  status: string;
  to: string;
}
export interface ProviderMessage {
  sid: string;
  status: string;
  numSegments: string;
  price: string | null;
  priceUnit: string | null;
}
export interface TwilioPort {
  lookupPhone: (
    phone: string,
  ) => Promise<{ countryCode: string; valid: boolean; phoneNumber: string }>;
  startVerification: (phone: string) => Promise<Verification>;
  checkVerification: (phone: string, code: string) => Promise<Verification>;
  sendMessage: (parameters: {
    messagingServiceSid: string;
    to: string;
    body: string;
    statusCallback: string;
    validityPeriod: number;
  }) => Promise<{ sid: string; status: string }>;
  getMessage: (sid: string) => Promise<ProviderMessage>;
}

function canadianFormat(phone: string) {
  return /^\+1[2-9]\d{9}$/.test(phone);
}

export function createTwilioProvider(config: TwilioProviderConfig, injectedPort?: TwilioPort) {
  for (const name of [
    "accountSid",
    "apiKeySid",
    "apiKeySecret",
    "authToken",
    "verifyServiceSid",
    "messagingServiceSid",
  ] as const) {
    nonempty(config[name], name);
  }
  const base = trustedUrl(config.publicWebhookBaseUrl);
  if (base.pathname !== "/" || base.search) throw new Error("Webhook base URL must be an origin.");
  const statusPath = config.statusCallbackPath ?? "/api/webhooks/twilio/status";
  const inboundPath = config.inboundWebhookPath ?? "/api/webhooks/twilio/inbound";
  for (const path of [statusPath, inboundPath]) {
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error("Invalid webhook path.");
  }
  const timeout = config.timeoutMs ?? 15_000;
  const sdk = twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    timeout,
    autoRetry: false,
  });
  const port: TwilioPort = injectedPort ?? {
    lookupPhone: (phone) => sdk.lookups.v2.phoneNumbers(phone).fetch(),
    startVerification: (phone) =>
      sdk.verify.v2
        .services(config.verifyServiceSid)
        .verifications.create({ to: phone, channel: "sms" }),
    checkVerification: (phone, code) =>
      sdk.verify.v2
        .services(config.verifyServiceSid)
        .verificationChecks.create({ to: phone, code }),
    sendMessage: (parameters) => sdk.messages.create(parameters),
    getMessage: (sid) => sdk.messages(sid).fetch(),
  };

  return {
    async lookupCanadianPhone(phone: string) {
      if (!canadianFormat(phone)) return { valid: false as const, code: "PHONE_INVALID" };
      const result = await withDeadline(() => port.lookupPhone(phone), timeout);
      if (!result.valid || result.countryCode !== "CA" || result.phoneNumber !== phone) {
        return { valid: false as const, code: "PHONE_NOT_CANADIAN" };
      }
      return { valid: true as const, phone: result.phoneNumber };
    },

    async startVerification(phone: string): Promise<SendResult> {
      if (!canadianFormat(phone))
        return { outcome: "rejected", code: "PHONE_INVALID", retryable: false };
      try {
        const result = await withDeadline(() => port.startVerification(phone), timeout);
        if (!result.sid || result.to !== phone || result.status !== "pending") {
          return { outcome: "unknown", code: "VERIFY_INVALID_RESPONSE" };
        }
        return { outcome: "accepted", providerId: result.sid, status: "pending" };
      } catch (error) {
        return sendFailure(error, "VERIFY");
      }
    },

    async checkVerification(phone: string, code: string) {
      if (!canadianFormat(phone) || !/^\d{4,10}$/.test(code)) {
        return { outcome: "rejected" as const, code: "VERIFY_INVALID_INPUT", retryable: false };
      }
      try {
        const result = await withDeadline(() => port.checkVerification(phone, code), timeout);
        if (result.to !== phone)
          return { outcome: "unknown" as const, code: "VERIFY_DESTINATION_MISMATCH" };
        if (result.status === "approved")
          return { outcome: "approved" as const, phone, providerId: result.sid };
        if (result.status === "pending")
          return { outcome: "pending" as const, code: "VERIFY_CODE_INCORRECT" };
        return {
          outcome: "rejected" as const,
          code: "VERIFY_EXPIRED_OR_REJECTED",
          retryable: false,
        };
      } catch (error) {
        if (providerStatus(error) === 404)
          return {
            outcome: "rejected" as const,
            code: "VERIFY_EXPIRED_OR_UNAVAILABLE",
            retryable: false,
          };
        return sendFailure(error, "VERIFY");
      }
    },

    async sendSms(input: { deliveryId: string; to: string; body: string }): Promise<SendResult> {
      opaqueId(input.deliveryId);
      if (!canadianFormat(input.to) || !input.body || input.body.length > 1600) {
        return { outcome: "rejected", code: "SMS_INVALID_MESSAGE", retryable: false };
      }
      try {
        enforceSmsLimit(input.body, 10);
      } catch {
        return { outcome: "rejected", code: "SMS_SEGMENT_LIMIT", retryable: false };
      }
      const callback = new URL(statusPath, base);
      callback.searchParams.set("deliveryId", input.deliveryId);
      try {
        const result = await withDeadline(
          () =>
            port.sendMessage({
              messagingServiceSid: config.messagingServiceSid,
              to: input.to,
              body: input.body,
              statusCallback: callback.href,
              validityPeriod: 300,
            }),
          timeout,
        );
        if (!result.sid) return { outcome: "unknown", code: "TWILIO_INVALID_RESPONSE" };
        return { outcome: "accepted", providerId: result.sid, status: result.status };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 21610) {
          return { outcome: "rejected", code: "TWILIO_OPTED_OUT", retryable: false };
        }
        return sendFailure(error, "TWILIO");
      }
    },

    async getMessage(sid: string): Promise<ProviderMessage> {
      if (!/^SM[a-zA-Z0-9]{32}$/.test(sid)) throw new Error("Invalid SMS identifier.");
      return withDeadline(() => port.getMessage(sid), timeout);
    },

    verifyWebhook(input: {
      rawBody: string;
      signature: string;
      url: string;
    }): Record<string, string> {
      try {
        const url = trustedUrl(input.url);
        if (url.origin !== base.origin || ![statusPath, inboundPath].includes(url.pathname))
          throw new Error("Untrusted callback URL.");
        const fields = new URLSearchParams(input.rawBody);
        const params: Record<string, string> = Object.create(null);
        for (const [key, value] of fields) {
          if (Object.hasOwn(params, key)) throw new Error("Repeated webhook field.");
          params[key] = value;
        }
        if (
          !twilio.validateRequest(config.authToken, input.signature, url.href, params) ||
          params.AccountSid !== config.accountSid
        )
          throw new Error("Invalid signature or account.");
        return params;
      } catch {
        throw new InvalidWebhookError();
      }
    },
  };
}
