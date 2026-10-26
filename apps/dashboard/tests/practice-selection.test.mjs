import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dailyPractice,
  eligiblePractices,
  practiceSessionKey,
  randomPractice,
} from "../lib/practice-selection.ts";

const fixtures = [
  { id: "bible-kindness", source: "bible", category: "Compassion" },
  { id: "bible-listening", source: "bible", category: "Patience" },
  { id: "bom-kindness", source: "book-of-mormon", category: "Compassion" },
  { id: "bom-service", source: "book-of-mormon", category: "Service" },
];

describe("eligible scripture practice selection", () => {
  it("never includes an unchosen source and intersects selected topics", () => {
    assert.deepEqual(
      eligiblePractices(fixtures, "bible", []).map((item) => item.id),
      ["bible-kindness", "bible-listening"],
    );
    assert.deepEqual(
      eligiblePractices(fixtures, "book-of-mormon", ["Compassion"]).map((item) => item.id),
      ["bom-kindness"],
    );
    assert.deepEqual(
      eligiblePractices(fixtures, "both", ["Compassion"]).map((item) => item.id),
      ["bible-kindness", "bom-kindness"],
    );
  });
  it("returns an honest empty collection instead of widening preferences", () => {
    assert.deepEqual(eligiblePractices(fixtures, "bible", ["Service"]), []);
    assert.equal(dailyPractice([], "2026-10-16"), undefined);
    assert.equal(randomPractice([], "missing"), undefined);
  });
  it("keeps the initial practice stable for the same local day and eligible collection", () => {
    const eligible = eligiblePractices(fixtures, "bible", []);
    const first = dailyPractice(eligible, "2026-10-16");
    assert.equal(dailyPractice(eligible, "2026-10-16"), first);
    assert.notEqual(dailyPractice(eligible, "2026-10-17"), first);
    assert.ok(eligible.includes(dailyPractice(eligible, "2026-10-17")));
  });
  it("randomly selects across alternatives without repeating the displayed practice", () => {
    assert.equal(randomPractice(fixtures, "bible-kindness", () => 0).id, "bible-listening");
    assert.equal(randomPractice(fixtures, "bible-kindness", () => 0.5).id, "bom-kindness");
    assert.equal(randomPractice(fixtures, "bible-kindness", () => 0.9999).id, "bom-service");
    for (const value of [0, 0.1, 0.33, 0.5, 0.9, 1])
      assert.notEqual(randomPractice(fixtures, "bible-kindness", () => value).id, "bible-kindness");
  });
  it("keeps singleton selections usable and bounds an injected random value", () => {
    assert.equal(
      randomPractice([fixtures[0]], fixtures[0].id, () => 0.8),
      fixtures[0],
    );
    assert.equal(
      randomPractice(fixtures, "unknown", () => -5),
      fixtures[0],
    );
    assert.equal(
      randomPractice(fixtures, "unknown", () => 5),
      fixtures.at(-1),
    );
    assert.equal(
      randomPractice(fixtures, "unknown", () => Number.NaN),
      fixtures[0],
    );
  });
  it("resets a selection session on source, topics, or local-date changes, but not topic order", () => {
    const key = practiceSessionKey("bible", ["Compassion", "Patience"], "2026-10-16");
    assert.equal(
      practiceSessionKey("bible", ["Patience", "Compassion", "Compassion"], "2026-10-16"),
      key,
    );
    assert.notEqual(
      practiceSessionKey("book-of-mormon", ["Compassion", "Patience"], "2026-10-16"),
      key,
    );
    assert.notEqual(practiceSessionKey("bible", ["Compassion"], "2026-10-16"), key);
    assert.notEqual(practiceSessionKey("bible", ["Compassion", "Patience"], "2026-10-17"), key);
  });
});
