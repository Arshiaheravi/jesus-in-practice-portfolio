import { createHash } from "node:crypto";
import type { Preferences, Schedule } from "./contracts.ts";

export function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")),
  };
}
function minute(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function assignedWindowTime(
  userId: string,
  revision: number,
  date: string,
  schedule: Schedule,
) {
  const start = minute(schedule.windowStart);
  const width = minute(schedule.windowEnd) - start;
  if (width <= 0) throw new Error("Invalid scheduling window");
  const hash = createHash("sha256").update(`${userId}:${revision}:${date}`).digest().readUInt32BE();
  const assigned = start + (hash % width);
  return `${String(Math.floor(assigned / 60)).padStart(2, "0")}:${String(assigned % 60).padStart(2, "0")}`;
}
/** Five-minute catch-up only. Missing DST times are skipped; repeated local times share a key. */
export function dueOccurrences(input: {
  userId: string;
  revision: number;
  preferences: Preferences;
  schedule: Schedule;
  now: Date;
  updatedAt?: Date;
}) {
  const { userId, revision, preferences, schedule, now, updatedAt } = input;
  if (!preferences.onboarded || schedule.paused) return [];
  const found = new Map<string, { key: string; at: Date; date: string }>();
  const minuteNow = Math.floor(now.getTime() / 60_000) * 60_000;
  for (let offset = 4; offset >= 0; offset--) {
    const at = new Date(minuteNow - offset * 60_000);
    if (updatedAt && at < updatedAt) continue;
    const local = localParts(at, preferences.timezone);
    if (!schedule.days.includes(local.day)) continue;
    const times =
      schedule.mode === "fixed"
        ? schedule.times
        : [assignedWindowTime(userId, revision, local.date, schedule)];
    if (!times.includes(local.time)) continue;
    // Deliberately independent of profile revision: changing a preference at the same due time must not duplicate a message.
    const key = `${userId}:${local.date}:${schedule.mode === "window" ? "window" : local.time}`;
    found.set(key, { key, at, date: local.date });
  }
  return [...found.values()];
}

export function selectPractice<T extends { id: string; source: string; category: string }>(
  catalogue: readonly T[],
  preferences: Preferences,
  occurrenceKey: string,
): T | undefined {
  const available = catalogue.filter(
    (practice) =>
      (preferences.source === "both" || preferences.source === practice.source) &&
      (!preferences.topics.length || preferences.topics.includes(practice.category)),
  );
  if (!available.length) return undefined;
  const hash = createHash("sha256").update(occurrenceKey).digest().readUInt32BE();
  return available[hash % available.length];
}
