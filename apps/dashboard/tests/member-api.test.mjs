import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultState, toggleCompletion } from "../lib/demo-model.ts";
import { commandForChange, MemberApiError, memberError } from "../lib/member-api.ts";

const state = () => structuredClone(defaultState);

test("preferences send only an explicit preference command, not account state", () => {
  const before = state();
  before.notes = { private: "Do not transmit this reflection" };
  const command = commandForChange(before, { ...before, source: "both", topics: ["Service"] });
  assert.deepEqual(command, {
    type: "preferences",
    source: "both",
    topics: ["Service"],
    channel: "email",
    timezone: "America/Toronto",
  });
  assert.equal("notes" in command, false);
  assert.equal("plan" in command, false);
});
test("schedule, channel and timezone save in a single atomic command", () => {
  const before = state();
  const after = {
    ...before,
    channel: "both",
    timezone: "America/Vancouver",
    schedule: { ...before.schedule, times: ["10:30"] },
  };
  assert.deepEqual(commandForChange(before, after), {
    type: "schedule",
    schedule: after.schedule,
    channel: "both",
    timezone: "America/Vancouver",
  });
});
test("onboarding includes all selected preferences without a client entitlement", () => {
  const before = state();
  const after = { ...before, onboarded: true, source: "book-of-mormon", topics: ["Service"] };
  assert.deepEqual(commandForChange(before, after), {
    type: "onboarding",
    source: after.source,
    topics: after.topics,
    channel: after.channel,
    timezone: after.timezone,
    schedule: after.schedule,
  });
});
test("bookmark commands express desired state for safe repeated requests", () => {
  const before = state();
  const saved = { ...before, saved: ["notice-your-neighbour"] };
  assert.deepEqual(commandForChange(before, saved), {
    type: "saved",
    practiceId: "notice-your-neighbour",
    saved: true,
  });
  assert.deepEqual(commandForChange(saved, before), {
    type: "saved",
    practiceId: "notice-your-neighbour",
    saved: false,
  });
});
test("completion command records and removes the exact practice and date", () => {
  const before = state();
  const after = toggleCompletion(before, "notice-your-neighbour", "2026-10-17");
  assert.deepEqual(commandForChange(before, after), {
    type: "completion",
    practiceId: "notice-your-neighbour",
    date: "2026-10-17",
    completed: true,
  });
  assert.equal(commandForChange(after, before).completed, false);
});
test("legacy local retention does not turn a new completion into deletion of old server history", () => {
  const before = state();
  before.completed = Array.from({ length: 2000 }, (_, index) => ({
    id: `practice-${index}`,
    date: "2026-10-16",
  }));
  const after = toggleCompletion(before, "notice-your-neighbour", "2026-10-17");
  assert.deepEqual(commandForChange(before, after), {
    type: "completion",
    practiceId: "notice-your-neighbour",
    date: "2026-10-17",
    completed: true,
  });
});
test("reflection removal sends an empty value for that reflection only", () => {
  const before = { ...state(), notes: { first: "Keep", second: "Remove" } };
  assert.deepEqual(commandForChange(before, { ...before, notes: { first: "Keep" } }), {
    type: "reflection",
    practiceId: "second",
    text: "",
  });
});
test("unsupported plan changes and mixed edits fail rather than partially saving", () => {
  const before = state();
  assert.throws(() => commandForChange(before, { ...before, plan: "both" }), MemberApiError);
  assert.throws(
    () => commandForChange(before, { ...before, source: "both", saved: ["one"] }),
    MemberApiError,
  );
  assert.throws(
    () => commandForChange(before, { ...before, saved: ["one", "two"] }),
    MemberApiError,
  );
});
test("conflict feedback preserves the draft and provides a recovery instruction", () => {
  const message = memberError(new MemberApiError("Conflict", "CONFLICT", 409));
  assert.match(message, /draft is still here/);
  assert.match(message, /cancel/);
});
