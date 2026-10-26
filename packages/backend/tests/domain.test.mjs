import assert from "node:assert/strict";
import test from "node:test";
import { consentVersion, defaultPreferences, defaultSchedule } from "../src/contracts.ts";
import { assignedWindowTime, dueOccurrences, selectPractice } from "../src/schedule.ts";
import { unsubscribeToken, readUnsubscribeToken } from "../src/tokens.ts";
import { consentSchema, memberMutationSchema } from "../src/validation.ts";

test("member input rejects unknown ownership fields and invalid dates", () => {
  assert.equal(
    memberMutationSchema.safeParse({
      revision: 1,
      userId: "other",
      command: { type: "saved", practiceId: "notice-your-neighbour", saved: true },
    }).success,
    false,
  );
  assert.equal(
    memberMutationSchema.safeParse({
      revision: 1,
      command: {
        type: "completion",
        practiceId: "notice-your-neighbour",
        date: "2026-02-30",
        completed: true,
      },
    }).success,
    false,
  );
});
test("consent grants require the displayed terms version while withdrawals remain available without one", () => {
  for (const channel of ["email", "sms"]) {
    assert.equal(consentSchema.safeParse({ channel, enabled: true }).success, false);
    assert.equal(
      consentSchema.safeParse({ channel, enabled: true, consentVersion: "" }).success,
      false,
    );
    assert.equal(
      consentSchema.safeParse({
        channel,
        enabled: true,
        consentVersion: consentVersion(channel, 10),
      }).success,
      true,
    );
    assert.equal(consentSchema.safeParse({ channel, enabled: false }).success, true);
  }
});
test("scheduler uses Toronto DST and deduplicates repeated local times", () => {
  const input = {
    userId: "u",
    revision: 1,
    preferences: { ...defaultPreferences, onboarded: true },
    schedule: { ...defaultSchedule, times: ["01:30"] },
  };
  const first = dueOccurrences({ ...input, now: new Date("2026-11-01T05:30:00Z") });
  const second = dueOccurrences({ ...input, now: new Date("2026-11-01T06:30:00Z") });
  assert.equal(first.length, 1);
  assert.equal(first[0].key, second[0].key);
  assert.equal(
    dueOccurrences({
      ...input,
      schedule: { ...input.schedule, times: ["02:30"] },
      now: new Date("2026-03-08T07:30:00Z"),
    }).length,
    0,
  );
});
test("window assignment is stable; pause and missed-send limits apply", () => {
  const schedule = { ...defaultSchedule, mode: "window" };
  assert.equal(
    assignedWindowTime("a", 2, "2026-10-17", schedule),
    assignedWindowTime("a", 2, "2026-10-17", schedule),
  );
  const input = {
    userId: "a",
    revision: 1,
    preferences: { ...defaultPreferences, onboarded: true },
    schedule: defaultSchedule,
    now: new Date("2026-10-17T12:05:00Z"),
  };
  assert.deepEqual(dueOccurrences(input), []);
  assert.deepEqual(
    dueOccurrences({
      ...input,
      schedule: { ...defaultSchedule, paused: true },
      now: new Date("2026-10-17T12:00:00Z"),
    }),
    [],
  );
});
test("changing preferences can move a random window time without creating a second daily occurrence", () => {
  const schedule = { ...defaultSchedule, mode: "window" };
  const userId = "window-member";
  const date = "2026-10-17";
  const previousTime = assignedWindowTime(userId, 1, date, schedule);
  const changedTime = assignedWindowTime(userId, 2, date, schedule);
  assert.notEqual(previousTime, changedTime, "the fixture exercises different assigned minutes");
  const preferences = { ...defaultPreferences, onboarded: true };
  const original = dueOccurrences({
    userId,
    revision: 1,
    preferences,
    schedule,
    now: new Date(`${date}T${previousTime}:00-04:00`),
  });
  const changed = dueOccurrences({
    userId,
    revision: 2,
    preferences: { ...preferences, source: "book-of-mormon" },
    schedule,
    now: new Date(`${date}T${changedTime}:00-04:00`),
  });
  assert.equal(original.length, 1);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].key, original[0].key);
  const nextDate = "2026-10-18";
  const nextTime = assignedWindowTime(userId, 2, nextDate, schedule);
  const nextDay = dueOccurrences({
    userId,
    revision: 2,
    preferences,
    schedule,
    now: new Date(`${nextDate}T${nextTime}:00-04:00`),
  });
  assert.equal(nextDay.length, 1);
  assert.notEqual(nextDay[0].key, original[0].key);
});
test("source and topic filtering never silently crosses collections", () => {
  assert.equal(
    selectPractice(
      [{ id: "a", source: "book-of-mormon", category: "Rest" }],
      defaultPreferences,
      "x",
    ),
    undefined,
  );
});
test("unsubscribe tokens are destination-bound, authenticated and valid at least 60 days", () => {
  const destinationHash = "c".repeat(64);
  const token = unsubscribeToken(
    "a".repeat(32),
    "11111111-1111-4111-8111-111111111111",
    "email",
    destinationHash,
    0,
  );
  assert.deepEqual(readUnsubscribeToken("a".repeat(32), token, 61 * 86400000), {
    contactId: "11111111-1111-4111-8111-111111111111",
    channel: "email",
    destinationHash,
  });
  assert.equal(readUnsubscribeToken("b".repeat(32), token, 0), null);
  assert.equal(readUnsubscribeToken("a".repeat(32), token, 181 * 86400000), null);
  const invalid = unsubscribeToken(
    "a".repeat(32),
    "11111111-1111-4111-8111-111111111111",
    "email",
    "invalid",
    0,
  );
  assert.equal(readUnsubscribeToken("a".repeat(32), invalid, 0), null);
});
