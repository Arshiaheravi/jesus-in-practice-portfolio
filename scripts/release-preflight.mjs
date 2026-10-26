import { parseRetentionPolicy } from "../packages/backend/src/maintenance.ts";

const failures = [];
const need = (name) => {
  if (!process.env[name]?.trim()) failures.push(`Set ${name}.`);
};
for (const name of [
  "APP_ORIGIN",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "OPERATOR_NAME",
  "OPERATOR_MAILING_ADDRESS",
  "SUPPORT_EMAIL",
])
  need(name);
const supportEmail = process.env.SUPPORT_EMAIL?.trim();
if (
  supportEmail &&
  (supportEmail.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(supportEmail))
)
  failures.push("SUPPORT_EMAIL must be a valid operator contact email address.");
const secrets = [];
for (const name of [
  "RATE_LIMIT_SECRET",
  "DESTINATION_HASH_SECRET",
  "UNSUBSCRIBE_SIGNING_SECRET",
  "CRON_SECRET",
  "MONITORING_SECRET",
]) {
  need(name);
  // Match the effective value returned by the server's required()/secret() helpers.
  const value = process.env[name]?.trim();
  if (!value) continue;
  if (value.length < 32) failures.push(`${name} must contain at least 32 characters.`);
  secrets.push(value);
}
if (new Set(secrets).size !== secrets.length)
  failures.push("Use a different random value for each application secret.");
try {
  if (new URL(process.env.SUPABASE_URL).protocol !== "https:") throw new Error();
} catch {
  failures.push("SUPABASE_URL must be the approved HTTPS project endpoint.");
}
for (const name of ["APP_ORIGIN", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_DASHBOARD_URL"]) {
  try {
    // Match runtime trimming, then reject characters that URL parsing would normalize away.
    const value = process.env[name]?.trim();
    if (!value || /[\u0000-\u0020\u007f<>]/.test(value)) throw new Error();
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      /localhost|127\.0\.0\.1|example\./.test(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    failures.push(`${name} must be the approved HTTPS origin.`);
  }
}
if (process.env.NEXT_PUBLIC_APP_MODE !== "live")
  failures.push("Build both apps with NEXT_PUBLIC_APP_MODE=live.");
if (process.env.ENABLE_RETENTION !== "true" || !process.env.RETENTION_POLICY_JSON)
  failures.push("Approve RETENTION_POLICY_JSON and enable the reviewed maintenance policy.");
else {
  try {
    parseRetentionPolicy(JSON.parse(process.env.RETENTION_POLICY_JSON));
  } catch {
    failures.push("RETENTION_POLICY_JSON must satisfy the approved maintenance policy schema.");
  }
}
if (process.env.ENABLE_AI_DRAFTING === "true") {
  need("OPENAI_API_KEY");
  need("OPENAI_CONTENT_MODEL");
  if (process.env.CONTENT_RIGHTS_ENABLED !== "true")
    failures.push("AI drafting requires approved source editions and CONTENT_RIGHTS_ENABLED=true.");
}
if (process.env.APP_ORIGIN !== process.env.NEXT_PUBLIC_DASHBOARD_URL)
  failures.push("APP_ORIGIN and NEXT_PUBLIC_DASHBOARD_URL must match.");
if (process.env.ENABLE_EMAIL_DELIVERY === "true")
  for (const name of ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM"]) need(name);
if (process.env.ENABLE_SMS_DELIVERY === "true" || process.env.ENABLE_PHONE_VERIFICATION === "true")
  for (const name of [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_API_KEY_SID",
    "TWILIO_API_KEY_SECRET",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_VERIFY_SERVICE_SID",
    "TWILIO_MESSAGING_SERVICE_SID",
  ])
    need(name);
if (process.env.ENABLE_PAYMENTS === "true" || process.env.ENABLE_SMS_DELIVERY === "true") {
  const cents = Number(process.env.SMS_SEGMENT_PRICE_CAD_CENTS);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1000)
    failures.push("Approve SMS_SEGMENT_PRICE_CAD_CENTS (integer CAD cents per segment).");
  if (process.env.COMMERCE_POLICY_APPROVED !== "true")
    failures.push("Approve pricing, refunds and tax treatment before enabling SMS commerce.");
}
if (process.env.ENABLE_PAYMENTS === "true") {
  need("STRIPE_SECRET_KEY");
  need("STRIPE_WEBHOOK_SECRET");
  if (process.env.STRIPE_LIVE_MODE !== "true")
    failures.push("Production payments require STRIPE_LIVE_MODE=true after staging checks.");
}
if (
  process.env.STRIPE_LIVE_MODE === "true" &&
  !/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || "")
)
  failures.push("STRIPE_LIVE_MODE requires a live-mode Stripe server key (sk_live_ or rk_live_).");
console.log(
  JSON.stringify(
    {
      configurationReady: !failures.length,
      failures,
      note: "Configuration checks only. This does not verify domain ownership, provider approvals, delivery, payments, hosted CI, legal compliance, or backups.",
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
