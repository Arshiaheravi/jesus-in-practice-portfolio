import { categories } from "@jesus-in-practice/content";
import { z } from "zod";
export { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const unique = <T>(items: T[]) => new Set(items).size === items.length;
export const timezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone.");
export const scheduleSchema = z
  .strictObject({
    mode: z.enum(["fixed", "window"]),
    times: z.array(time).min(1).max(3).refine(unique),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(unique),
    windowStart: time,
    windowEnd: time,
    paused: z.boolean(),
  })
  .refine(
    (value) => value.mode !== "window" || value.windowStart < value.windowEnd,
    "Choose an end time after the start.",
  );
const preferenceFields = {
  source: z.enum(["bible", "book-of-mormon", "both"]),
  topics: z.array(z.enum(categories)).max(categories.length).refine(unique),
  channel: z.enum(["email", "sms", "both"]),
  timezone: timezoneSchema,
};
// Existence/eligibility is authoritative database state, checked inside mutateMember.
const practiceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
export const memberMutationSchema = z.strictObject({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  command: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("preferences"), ...preferenceFields }),
    z.strictObject({
      type: z.literal("onboarding"),
      ...preferenceFields,
      schedule: scheduleSchema,
    }),
    z.strictObject({
      type: z.literal("schedule"),
      schedule: scheduleSchema,
      channel: preferenceFields.channel,
      timezone: timezoneSchema,
    }),
    z.strictObject({ type: z.literal("saved"), practiceId, saved: z.boolean() }),
    z.strictObject({
      type: z.literal("completion"),
      practiceId,
      date: localDateSchema,
      completed: z.boolean(),
    }),
    z.strictObject({ type: z.literal("reflection"), practiceId, text: z.string().max(1500) }),
  ]),
});
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const authStartSchema = z.strictObject({ email: emailSchema });
export const authVerifySchema = z.strictObject({
  email: emailSchema,
  code: z.string().regex(/^\d{6,10}$/),
});
export const phoneSchema = z.strictObject({ phone: z.string().regex(/^\+1\d{10}$/) });
export const phoneVerifySchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
export const consentSchema = z
  .strictObject({
    channel: z.enum(["email", "sms"]),
    enabled: z.boolean(),
    consentVersion: z.string().min(1).max(100).optional(),
  })
  .refine((value) => !value.enabled || !!value.consentVersion, {
    message: "Review the current consent information before enabling reminders.",
    path: ["consentVersion"],
  });
export const checkoutSchema = z.strictObject({
  amountCents: z.union([z.literal(1000), z.literal(2500), z.literal(5000)]),
  operationId: z.string().uuid(),
});
export const deletionSchema = z.strictObject({ confirmation: z.literal("DELETE") });
export const cursorSchema = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/)
  .optional();
