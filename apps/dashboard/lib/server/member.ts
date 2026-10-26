import "server-only";

import type { MemberBootstrap } from "@jesus-in-practice/backend/contracts";
import { consentVersion } from "@jesus-in-practice/backend/contracts";
import { digestIdentifier } from "@jesus-in-practice/backend/tokens";

import {
  checkoutEnabled,
  operator,
  operatorConfigured,
  phoneVerificationEnabled,
  secret,
  sendingEnabled,
  smsRate,
} from "./config";
import { repository } from "./runtime";

export async function bootstrap(user: { id: string; email?: string }): Promise<MemberBootstrap> {
  const repo = repository();
  await repo.ensureProfile(user.id);
  const email = user.email!.toLowerCase();
  await repo.upsertContact(
    user.id,
    "email",
    email,
    true,
    digestIdentifier(secret("DESTINATION_HASH_SECRET"), `email:${email}`),
  );
  const data = await repo.getState(user.id);
  const contact = (channel: "email" | "sms") =>
    data.contacts.find((item) => item.channel === channel);
  const operatorDetails = operatorConfigured() ? operator() : null;
  return {
    revision: data.profile.version,
    capabilities: {
      emailDelivery: sendingEnabled("email"),
      smsDelivery: sendingEnabled("sms"),
      phoneVerification: phoneVerificationEnabled(),
    },
    operator: operatorDetails
      ? {
          name: operatorDetails.senderName,
          mailingAddress: operatorDetails.mailingAddress,
          supportEmail: operatorDetails.supportEmail,
        }
      : null,
    state: {
      version: 1,
      ...data.profile.preferences,
      plan: data.profile.preferences.channel === "email" ? "email" : "both",
      schedule: data.profile.schedule,
      saved: data.saved,
      notes: data.notes,
      completed: data.completions.items.map((item) => ({
        id: item.practiceId,
        date: item.localDate,
      })),
    },
    account: {
      email,
      phone: contact("sms")?.verifiedAt ? contact("sms")!.value : null,
      emailConsent:
        !!contact("email")?.consentGranted &&
        contact("email")?.consentVersion === consentVersion("email", null),
      smsConsent:
        !!contact("sms")?.consentGranted &&
        contact("sms")?.consentVersion === consentVersion("sms", smsRate()),
    },
    wallet: {
      supportId: data.wallet.id,
      availableCents: data.wallet.availableCents,
      reservedCents: data.wallet.reservedCents,
      rateCents: smsRate(),
      enabled: checkoutEnabled() && !data.wallet.blockedReason,
      blockedReason: data.wallet.blockedReason,
    },
    history: {
      total: data.completions.total,
      hasMore: data.completions.hasMore,
      nextCursor: data.completions.nextCursor,
    },
  };
}
