import assert from "node:assert/strict";
import test from "node:test";

import { categories, practices, sourceLabels } from "./index.ts";

test("content IDs are unique, stable URL-safe slugs with complete lesson fields", () => {
  const ids = new Set<string>();
  for (const practice of practices) {
    assert.match(practice.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(practice.id), `Duplicate practice ID: ${practice.id}`);
    ids.add(practice.id);
    for (const field of [
      "title",
      "reference",
      "summary",
      "plainMeaning",
      "everydayExample",
      "smsText",
      "action",
      "reflection",
    ] as const) {
      assert.ok(practice[field].trim().length > 0, `${practice.id} is missing ${field}`);
    }
    assert.ok(categories.includes(practice.category), `Unknown category for ${practice.id}`);
    assert.ok(Number.isInteger(practice.minutes) && practice.minutes > 0);
  }
});

test("existing practice IDs remain available for saved practices and completion history", () => {
  const originalIds = [
    "notice-your-neighbour",
    "listen-before-answering",
    "tell-the-truth-kindly",
    "forgive-with-boundaries",
    "notice-one-good-thing",
    "make-room-for-rest",
    "do-good-quietly",
    "take-a-step-toward-peace",
    "choose-a-gentle-answer",
    "make-space-for-another-view",
    "put-a-gift-to-good-use",
    "return-to-one-good-habit",
    "serve-someone-nearby",
    "choose-a-sustainable-pace",
    "share-what-you-can",
    "be-present-in-grief",
    "begin-with-one-small-step",
    "practise-patience-in-a-delay",
    "let-care-become-action",
    "close-the-day-with-gratitude",
    "be-willing-to-learn",
    "celebrate-someone-else",
    "make-room-at-the-table",
    "give-time-to-what-matters",
  ];
  for (const id of originalIds) {
    assert.ok(
      practices.some((practice) => practice.id === id),
      `Missing existing practice: ${id}`,
    );
  }
});

test("plain explanations and everyday examples stay short enough to read at a glance", () => {
  const segmenter = new Intl.Segmenter("en-CA", { granularity: "sentence" });
  for (const practice of practices) {
    for (const field of ["plainMeaning", "everydayExample"] as const) {
      const sentences = [...segmenter.segment(practice[field])].filter((item) =>
        item.segment.trim(),
      );
      assert.ok(sentences.length <= 2, `${practice.id}.${field} exceeds two sentences`);
    }
  }
});

test("every concise message identifies its collection and exact scripture reference", () => {
  for (const practice of practices) {
    const source = practice.source === "bible" ? "Bible (KJV)" : "Book of Mormon";
    assert.ok(
      practice.smsText.startsWith(`${source} - ${practice.reference}. `),
      `Missing attribution: ${practice.id}`,
    );
    // This is an editorial copy limit, not a promise about encoded SMS segments.
    assert.ok(practice.smsText.length <= 360, `Message preview too long: ${practice.id}`);
    const messageBody = practice.smsText.slice(`${source} - ${practice.reference}. `.length);
    assert.ok(messageBody.trim().length > 0, `Missing explanation and application: ${practice.id}`);
  }
});

test("both opt-in collections have useful coverage and correctly attributed primary links", () => {
  for (const source of Object.keys(sourceLabels)) {
    assert.ok(practices.filter((practice) => practice.source === source).length >= 10);
  }
  for (const practice of practices) {
    const url = new URL(practice.sourceUrl);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "www.churchofjesuschrist.org");
    assert.equal(url.searchParams.get("lang"), "eng");
    assert.ok(url.hash.startsWith("#p"), `Missing passage anchor for ${practice.id}`);
    if (practice.source === "bible") {
      assert.match(url.pathname, /^\/study\/scriptures\/(nt|ot)\//);
    } else {
      assert.match(url.pathname, /^\/study\/scriptures\/bofm\//);
    }
  }
});

test("every category is represented and forgiveness content preserves safe boundaries", () => {
  for (const category of categories) {
    assert.ok(
      practices.some((practice) => practice.category === category),
      `Empty category: ${category}`,
    );
  }
  const forgiveness = practices.filter((practice) => practice.category === "Forgiveness");
  assert.ok(forgiveness.length > 0);
  for (const practice of forgiveness) {
    assert.match(`${practice.summary} ${practice.action}`, /boundar|unsafe/i);
  }
});
