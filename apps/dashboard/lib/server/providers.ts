import "server-only";

import { createResendProvider } from "@jesus-in-practice/backend/providers/resend";
import { createStripeProvider } from "@jesus-in-practice/backend/providers/stripe";
import { createTwilioProvider } from "@jesus-in-practice/backend/providers/twilio";

import { origin, required, supportEmail } from "./config";

export function stripe(timeoutMs = 15_000) {
  return createStripeProvider({
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    successUrl: `${origin()}/wallet?checkout=complete`,
    cancelUrl: `${origin()}/wallet?checkout=cancelled`,
    liveMode: process.env.STRIPE_LIVE_MODE === "true",
    timeoutMs,
  });
}
export function resend() {
  return createResendProvider({
    apiKey: required("RESEND_API_KEY"),
    webhookSecret: required("RESEND_WEBHOOK_SECRET"),
    from: required("EMAIL_FROM"),
    replyTo: supportEmail(),
  });
}
export function twilio(timeoutMs = 15_000) {
  return createTwilioProvider({
    accountSid: required("TWILIO_ACCOUNT_SID"),
    apiKeySid: required("TWILIO_API_KEY_SID"),
    apiKeySecret: required("TWILIO_API_KEY_SECRET"),
    authToken: required("TWILIO_AUTH_TOKEN"),
    verifyServiceSid: required("TWILIO_VERIFY_SERVICE_SID"),
    messagingServiceSid: required("TWILIO_MESSAGING_SERVICE_SID"),
    publicWebhookBaseUrl: origin(),
    timeoutMs,
  });
}
