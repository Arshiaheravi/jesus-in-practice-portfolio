export const STORAGE_KEY = "jesus-in-practice:preview:v1";
export const sources = ["bible", "book-of-mormon", "both"] as const;
export type SourcePreference = (typeof sources)[number];
export type Channel = "email" | "sms" | "both";
export type PreviewPlan = "explore" | "email" | "both";
export const timezones = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Regina",
  "America/Edmonton",
  "America/Vancouver",
  "America/Whitehorse",
] as const;
export const dayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface Schedule {
  mode: "fixed" | "window";
  times: string[];
  days: number[];
  windowStart: string;
  windowEnd: string;
  paused: boolean;
}

export interface DemoState {
  version: 1;
  onboarded: boolean;
  source: SourcePreference;
  topics: string[];
  channel: Channel;
  timezone: string;
  plan: PreviewPlan;
  schedule: Schedule;
  saved: string[];
  completed: { id: string; date: string }[];
  notes: Record<string, string>;
}

export const defaultState: DemoState = {
  version: 1,
  onboarded: false,
  source: "bible",
  topics: [],
  channel: "email",
  timezone: "America/Toronto",
  plan: "explore",
  schedule: {
    mode: "fixed",
    times: ["08:00"],
    days: [0, 1, 2, 3, 4, 5, 6],
    windowStart: "09:00",
    windowEnd: "17:00",
    paused: false,
  },
  saved: [],
  completed: [],
  notes: {},
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const validTime = (value: unknown): value is string =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const uniqueStrings = (value: unknown, allowed: readonly string[]) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (item): item is string => typeof item === "string" && allowed.includes(item),
          ),
        ),
      )
    : [];

export function validateSchedule(schedule: Schedule): string | null {
  if (
    !schedule.days.length ||
    schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    return "Choose at least one day of the week.";
  if (schedule.mode === "fixed") {
    if (
      !schedule.times.length ||
      schedule.times.length > 3 ||
      schedule.times.some((time) => !validTime(time))
    )
      return "Choose one to three valid reminder times.";
    if (new Set(schedule.times).size !== schedule.times.length)
      return "Choose a different time for each reminder.";
  } else if (
    !validTime(schedule.windowStart) ||
    !validTime(schedule.windowEnd) ||
    schedule.windowStart >= schedule.windowEnd
  ) {
    return "Choose a same-day window with an end time after its start.";
  }
  return null;
}

export function parseStoredState(
  raw: string | null,
  practiceIds: readonly string[],
  categoryNames: readonly string[],
): { state: DemoState; recovered: boolean } {
  if (raw === null) return { state: defaultState, recovered: false };
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1) throw new Error("Unsupported preview data");
    const candidate = isRecord(data.schedule) ? data.schedule : {};
    const schedule: Schedule = {
      mode: candidate.mode === "window" ? "window" : "fixed",
      times: Array.isArray(candidate.times)
        ? Array.from(new Set(candidate.times.filter(validTime))).slice(0, 3)
        : ["08:00"],
      days: Array.isArray(candidate.days)
        ? Array.from(
            new Set(
              candidate.days.filter(
                (day): day is number =>
                  typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6,
              ),
            ),
          )
        : defaultState.schedule.days,
      windowStart: validTime(candidate.windowStart) ? candidate.windowStart : "09:00",
      windowEnd: validTime(candidate.windowEnd) ? candidate.windowEnd : "17:00",
      paused: candidate.paused === true,
    };
    const notes: Record<string, string> = {};
    if (isRecord(data.notes))
      for (const id of practiceIds) {
        const note = data.notes[id];
        if (typeof note === "string") notes[id] = note.slice(0, 1500);
      }
    const completions = Array.isArray(data.completed)
      ? data.completed
          .filter(
            (entry): entry is { id: string; date: string } =>
              isRecord(entry) &&
              typeof entry.id === "string" &&
              practiceIds.includes(entry.id) &&
              typeof entry.date === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
              !Number.isNaN(Date.parse(entry.date)) &&
              new Date(entry.date).toISOString().slice(0, 10) === entry.date,
          )
          .slice(-2000)
      : [];
    const completed = completions.filter(
      (entry, index) =>
        completions.findIndex((other) => other.id === entry.id && other.date === entry.date) ===
        index,
    );
    const state: DemoState = {
      version: 1,
      onboarded: data.onboarded === true,
      source: sources.includes(data.source as SourcePreference)
        ? (data.source as SourcePreference)
        : "bible",
      channel: ["email", "sms", "both"].includes(data.channel as string)
        ? (data.channel as Channel)
        : "email",
      timezone: timezones.includes(data.timezone as (typeof timezones)[number])
        ? (data.timezone as string)
        : defaultState.timezone,
      plan: ["explore", "email", "both"].includes(data.plan as string)
        ? (data.plan as PreviewPlan)
        : "explore",
      topics: uniqueStrings(data.topics, categoryNames),
      saved: uniqueStrings(data.saved, practiceIds),
      completed,
      notes,
      schedule: validateSchedule(schedule) ? defaultState.schedule : schedule,
    };
    return { state, recovered: false };
  } catch {
    return { state: defaultState, recovered: true };
  }
}

export function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((value) => value.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function toggleCompletion(state: DemoState, id: string, date: string): DemoState {
  const exists = state.completed.some((entry) => entry.id === id && entry.date === date);
  return {
    ...state,
    completed: exists
      ? state.completed.filter((entry) => entry.id !== id || entry.date !== date)
      : [...state.completed, { id, date }].slice(-2000),
  };
}

export function formatTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "p.m." : "a.m."}`;
}
