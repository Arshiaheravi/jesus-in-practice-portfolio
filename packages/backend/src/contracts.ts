export type Channel = "email" | "sms";
export type SourcePreference = "bible" | "book-of-mormon" | "both";
export interface Schedule {
  mode: "fixed" | "window";
  times: string[];
  days: number[];
  windowStart: string;
  windowEnd: string;
  paused: boolean;
}
export interface Preferences {
  onboarded: boolean;
  source: SourcePreference;
  topics: string[];
  channel: Channel | "both";
  timezone: string;
}
export interface MemberState extends Preferences {
  version: 1;
  plan: "explore" | "email" | "both";
  schedule: Schedule;
  saved: string[];
  completed: { id: string; date: string }[];
  notes: Record<string, string>;
}
export interface WalletEntry {
  id: string;
  kind: string;
  amountCents: number;
  createdAt: string;
}
export interface WalletSummary {
  supportId?: string;
  availableCents: number;
  reservedCents: number;
  rateCents: number | null;
  enabled: boolean;
  blockedReason?: string | null;
}
export interface MemberBootstrap {
  state: MemberState;
  revision: number;
  capabilities: {
    emailDelivery: boolean;
    smsDelivery: boolean;
    phoneVerification: boolean;
  };
  account: { email: string; phone: string | null; emailConsent: boolean; smsConsent: boolean };
  wallet: WalletSummary;
  history: { total: number; hasMore: boolean; nextCursor: string | null };
  operator?: { name: string; mailingAddress: string; supportEmail: string } | null;
}
export type MemberCommand =
  | {
      type: "preferences";
      source: SourcePreference;
      topics: string[];
      channel: Channel | "both";
      timezone: string;
    }
  | { type: "schedule"; schedule: Schedule; channel: Channel | "both"; timezone: string }
  | { type: "saved"; practiceId: string; saved: boolean }
  | { type: "completion"; practiceId: string; date: string; completed: boolean }
  | { type: "reflection"; practiceId: string; text: string }
  | ({ type: "onboarding"; schedule: Schedule } & Omit<Preferences, "onboarded">);
export interface ApiError {
  error: { code: string; message: string; requestId: string };
}
export const defaultPreferences: Preferences = {
  onboarded: false,
  source: "bible",
  topics: [],
  channel: "email",
  timezone: "America/Toronto",
};
export const defaultSchedule: Schedule = {
  mode: "fixed",
  times: ["08:00"],
  days: [0, 1, 2, 3, 4, 5, 6],
  windowStart: "09:00",
  windowEnd: "17:00",
  paused: false,
};
export const CONSENT_VERSION = "2026-10-17-v1";
export function consentVersion(channel: Channel, rateCents: number | null) {
  return channel === "sms"
    ? `${CONSENT_VERSION}:sms:${rateCents ?? "unconfigured"}`
    : CONSENT_VERSION;
}
