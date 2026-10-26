import "server-only";

export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new ServiceError(
      "UNAVAILABLE",
      "This service is not configured yet. Please try again later.",
      503,
    );
  return value;
}
export function isLive() {
  return process.env.NEXT_PUBLIC_APP_MODE === "live";
}
export function requireLive() {
  if (!isLive())
    throw new ServiceError(
      "PREVIEW_ONLY",
      "This is the local preview. Accounts and delivery are disabled.",
      503,
    );
}
export function origin() {
  try {
    const value = required("APP_ORIGIN");
    if (/[\u0000-\u0020\u007f<>]/.test(value)) throw new Error();
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ServiceError("UNAVAILABLE", "Application origin needs configuration.", 503);
  }
}
export function secret(name: string) {
  const value = required(name);
  if (value.length < 32)
    throw new ServiceError("UNAVAILABLE", "Service security settings need configuration.", 503);
  return value;
}
function configuredSupportEmail() {
  const value = process.env.SUPPORT_EMAIL?.trim();
  return value && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)
    ? value
    : null;
}
export function supportEmail() {
  const value = configuredSupportEmail();
  if (!value)
    throw new ServiceError("UNAVAILABLE", "The support contact needs configuration.", 503);
  return value;
}
export function operatorConfigured() {
  return (
    !!process.env.OPERATOR_NAME?.trim() &&
    !!process.env.OPERATOR_MAILING_ADDRESS?.trim() &&
    !!configuredSupportEmail()
  );
}
export function operator() {
  return {
    senderName: required("OPERATOR_NAME"),
    mailingAddress: required("OPERATOR_MAILING_ADDRESS"),
    supportEmail: supportEmail(),
  };
}
export function smsRate() {
  const value = Number(process.env.SMS_SEGMENT_PRICE_CAD_CENTS);
  return Number.isSafeInteger(value) && value > 0 && value <= 1000 ? value : null;
}
export function checkoutEnabled() {
  return (
    isLive() &&
    process.env.ENABLE_PAYMENTS === "true" &&
    !!smsRate() &&
    !!process.env.STRIPE_SECRET_KEY?.trim() &&
    !!process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
    operatorConfigured() &&
    process.env.COMMERCE_POLICY_APPROVED === "true"
  );
}
const twilioSettings = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_MESSAGING_SERVICE_SID",
];
export function phoneVerificationEnabled() {
  return (
    isLive() &&
    process.env.ENABLE_PHONE_VERIFICATION === "true" &&
    twilioSettings.every((key) => !!process.env[key]?.trim())
  );
}
export function sendingEnabled(channel: "email" | "sms") {
  const keys =
    channel === "email"
      ? ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM"]
      : twilioSettings;
  return (
    isLive() &&
    process.env[channel === "email" ? "ENABLE_EMAIL_DELIVERY" : "ENABLE_SMS_DELIVERY"] === "true" &&
    operatorConfigured() &&
    keys.every((key) => !!process.env[key]?.trim()) &&
    (channel === "email" || (!!smsRate() && process.env.COMMERCE_POLICY_APPROVED === "true"))
  );
}
