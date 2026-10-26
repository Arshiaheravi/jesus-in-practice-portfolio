import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dateInTimezone,
  defaultState,
  parseStoredState,
  toggleCompletion,
  validateSchedule,
} from "../lib/demo-model.ts";

const practiceIds = ["notice-your-neighbour", "listen-before-answering", "share-what-you-can"];
const categories = ["Compassion", "Patience", "Stewardship"];
const stateFixture = () => structuredClone(defaultState);
const parse = (value) => parseStoredState(JSON.stringify(value), practiceIds, categories);

describe("restoring local preview data", () => {
  it("starts a new browser with defaults without reporting corruption", () => {
    const result = parseStoredState(null, practiceIds, categories);
    assert.equal(result.recovered, false);
    assert.deepEqual(result.state, defaultState);
  });

  it("recovers from malformed JSON, unsupported versions, and non-object payloads", () => {
    for (const raw of ["{broken", "null", "[]", '"text"', "42", "{}", '{"version":2}']) {
      const result = parseStoredState(raw, practiceIds, categories);
      assert.equal(result.recovered, true, raw);
      assert.deepEqual(result.state, defaultState, raw);
    }
  });

  it("round-trips a valid setup, saved practice, completion, and reflection", () => {
    const state = {
      ...stateFixture(),
      onboarded: true,
      source: "both",
      topics: ["Compassion", "Stewardship"],
      channel: "sms",
      timezone: "America/St_Johns",
      plan: "both",
      schedule: {
        mode: "window",
        times: ["08:00"],
        days: [1, 3, 5],
        windowStart: "09:30",
        windowEnd: "16:15",
        paused: true,
      },
      saved: [practiceIds[0]],
      completed: [{ id: practiceIds[0], date: "2026-10-16" }],
      notes: { [practiceIds[0]]: "I noticed a chance to listen." },
    };
    assert.deepEqual(parse(state), { state, recovered: false });
  });

  it("normalizes unsupported settings and keeps only known unique topics and IDs", () => {
    const result = parse({
      version: 1,
      onboarded: "true",
      source: "unknown-source",
      channel: "push",
      timezone: "Mars/Olympus",
      plan: "enterprise",
      topics: ["Compassion", "unknown", 4, "Compassion", "Patience"],
      saved: [practiceIds[0], "deleted-practice", practiceIds[0], null, practiceIds[1]],
      email: "example@example.com",
      phone: "+1 416 555 0123",
    });
    assert.equal(result.recovered, false);
    assert.equal(result.state.onboarded, false);
    assert.equal(result.state.source, "bible");
    assert.equal(result.state.channel, "email");
    assert.equal(result.state.timezone, "America/Toronto");
    assert.equal(result.state.plan, "explore");
    assert.deepEqual(result.state.topics, ["Compassion", "Patience"]);
    assert.deepEqual(result.state.saved, [practiceIds[0], practiceIds[1]]);
    assert.equal("email" in result.state, false);
    assert.equal("phone" in result.state, false);
  });

  it("discards invalid completion dates and IDs while retaining valid leap days", () => {
    const first = { id: practiceIds[0], date: "2026-10-16" };
    const leapDay = { id: practiceIds[1], date: "2024-02-29" };
    const { state } = parse({
      ...stateFixture(),
      completed: [
        first,
        { ...first },
        { id: "deleted-practice", date: "2026-10-16" },
        { id: practiceIds[0], date: "2026-02-29" },
        { id: practiceIds[0], date: "2026-04-31" },
        { id: practiceIds[0], date: "2026-13-01" },
        { id: practiceIds[0], date: "16/10/2026" },
        { id: practiceIds[0], date: "2026-10-16T12:00:00Z" },
        { id: practiceIds[0], date: 20261016 },
        null,
        leapDay,
      ],
    });
    assert.deepEqual(state.completed, [first, leapDay]);
  });

  it("bounds reflections and ignores notes for removed practices or non-text values", () => {
    const { state } = parse({
      ...stateFixture(),
      notes: {
        [practiceIds[0]]: "a".repeat(1600),
        [practiceIds[1]]: 42,
        [practiceIds[2]]: "",
        "deleted-practice": "Do not restore this.",
      },
    });
    assert.deepEqual(state.notes, { [practiceIds[0]]: "a".repeat(1500), [practiceIds[2]]: "" });
  });

  it("normalizes reminder times and days before restoring a valid schedule", () => {
    const { state } = parse({
      ...stateFixture(),
      schedule: {
        mode: "fixed",
        times: ["08:00", "invalid", "08:00", "12:30", "23:59", "18:00"],
        days: [1, 1, -1, 7, 3.5, "2", 3],
        windowStart: "bad",
        windowEnd: "25:00",
        paused: "true",
      },
    });
    assert.deepEqual(state.schedule, {
      mode: "fixed",
      times: ["08:00", "12:30", "23:59"],
      days: [1, 3],
      windowStart: "09:00",
      windowEnd: "17:00",
      paused: false,
    });
  });

  it("replaces unusable restored schedules with safe defaults", () => {
    for (const schedule of [
      { ...defaultState.schedule, times: ["not-a-time"] },
      { ...defaultState.schedule, days: [] },
      { ...defaultState.schedule, mode: "window", windowStart: "22:00", windowEnd: "07:00" },
    ]) {
      assert.deepEqual(
        parse({ ...stateFixture(), schedule }).state.schedule,
        defaultState.schedule,
      );
    }
  });

  it("caps restored completion history at the most recent 2,000 entries", () => {
    const completed = Array.from({ length: 2005 }, (_, index) => ({
      id: practiceIds[index % practiceIds.length],
      date: new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10),
    }));
    assert.deepEqual(
      parse({ ...stateFixture(), completed }).state.completed,
      completed.slice(-2000),
    );
  });
});

describe("schedule validation", () => {
  it("accepts one to three distinct fixed times including midnight and the last minute", () => {
    for (const times of [["00:00"], ["08:00", "18:30"], ["00:00", "12:00", "23:59"]]) {
      assert.equal(validateSchedule({ ...defaultState.schedule, days: [0, 6], times }), null);
    }
  });

  it("requires a valid selection of days for fixed and window modes", () => {
    for (const mode of ["fixed", "window"]) {
      for (const days of [[], [-1], [7], [1.5], [NaN]]) {
        assert.match(validateSchedule({ ...defaultState.schedule, mode, days }), /day of the week/);
      }
    }
  });

  it("rejects missing, duplicate, malformed, and excessive fixed reminder times", () => {
    for (const times of [
      [],
      ["24:00"],
      ["9:00"],
      ["09:60"],
      ["09:00:00"],
      ["09:00", "10:00", "11:00", "12:00"],
    ]) {
      assert.match(validateSchedule({ ...defaultState.schedule, times }), /one to three valid/);
    }
    assert.match(
      validateSchedule({ ...defaultState.schedule, times: ["09:00", "09:00"] }),
      /different time/,
    );
  });

  it("requires a valid same-day surprise window with positive duration", () => {
    assert.equal(
      validateSchedule({
        ...defaultState.schedule,
        mode: "window",
        windowStart: "00:00",
        windowEnd: "23:59",
      }),
      null,
    );
    for (const [windowStart, windowEnd] of [
      ["09:00", "09:00"],
      ["22:00", "06:00"],
      ["invalid", "17:00"],
      ["09:00", "24:00"],
    ]) {
      assert.match(
        validateSchedule({ ...defaultState.schedule, mode: "window", windowStart, windowEnd }),
        /same-day window/,
      );
    }
  });
});

describe("Canadian calendar dates", () => {
  it("uses the chosen local date instead of UTC at midnight boundaries", () => {
    const cases = [
      ["2026-01-15T04:59:59Z", "America/Toronto", "2026-01-14"],
      ["2026-01-15T05:00:00Z", "America/Toronto", "2026-01-15"],
      ["2026-01-01T07:59:59Z", "America/Vancouver", "2025-12-31"],
      ["2026-01-01T08:00:00Z", "America/Vancouver", "2026-01-01"],
      ["2026-01-15T03:29:59Z", "America/St_Johns", "2026-01-14"],
      ["2026-01-15T03:30:00Z", "America/St_Johns", "2026-01-15"],
    ];
    for (const [instant, timezone, expected] of cases)
      assert.equal(
        dateInTimezone(new Date(instant), timezone),
        expected,
        `${timezone} at ${instant}`,
      );
  });

  it("respects spring and autumn daylight-saving changes rather than a fixed UTC offset", () => {
    const cases = [
      ["2026-03-08T04:59:59Z", "2026-03-07"],
      ["2026-03-08T05:00:00Z", "2026-03-08"],
      ["2026-03-08T06:59:59Z", "2026-03-08"],
      ["2026-03-08T07:00:00Z", "2026-03-08"],
      ["2026-03-09T03:59:59Z", "2026-03-08"],
      ["2026-03-09T04:00:00Z", "2026-03-09"],
      ["2026-11-01T05:59:59Z", "2026-11-01"],
      ["2026-11-01T06:00:00Z", "2026-11-01"],
      ["2026-11-02T04:59:59Z", "2026-11-01"],
      ["2026-11-02T05:00:00Z", "2026-11-02"],
    ];
    for (const [instant, expected] of cases)
      assert.equal(dateInTimezone(new Date(instant), "America/Toronto"), expected, instant);
    assert.equal(dateInTimezone(new Date("2026-07-01T05:59:59Z"), "America/Regina"), "2026-06-30");
    assert.equal(dateInTimezone(new Date("2026-07-01T06:00:00Z"), "America/Regina"), "2026-07-01");
  });
});

describe("completion history", () => {
  it("toggles only the selected practice on the selected day without mutating previous state", () => {
    const original = stateFixture();
    original.completed = [
      { id: practiceIds[0], date: "2026-10-15" },
      { id: practiceIds[1], date: "2026-10-16" },
    ];
    const snapshot = structuredClone(original);
    const added = toggleCompletion(original, practiceIds[0], "2026-10-16");
    assert.deepEqual(original, snapshot);
    assert.deepEqual(added.completed, [
      ...snapshot.completed,
      { id: practiceIds[0], date: "2026-10-16" },
    ]);
    const removed = toggleCompletion(added, practiceIds[0], "2026-10-16");
    assert.deepEqual(removed.completed, snapshot.completed);
    assert.equal(added.completed.length, 3);
    assert.notEqual(removed, added);
  });

  it("retains the newest 2,000 completions when a new day is added", () => {
    const state = stateFixture();
    state.completed = Array.from({ length: 2000 }, (_, index) => ({
      id: practiceIds[0],
      date: new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10),
    }));
    const next = toggleCompletion(state, practiceIds[1], "2026-10-16");
    assert.equal(next.completed.length, 2000);
    assert.deepEqual(next.completed[0], state.completed[1]);
    assert.deepEqual(next.completed.at(-1), { id: practiceIds[1], date: "2026-10-16" });
    assert.equal(state.completed.length, 2000);
    assert.deepEqual(state.completed[0], { id: practiceIds[0], date: "2020-01-01" });
  });
});
