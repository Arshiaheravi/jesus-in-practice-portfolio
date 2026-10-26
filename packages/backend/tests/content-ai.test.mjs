import test from "node:test";
import assert from "node:assert/strict";
import { ContentDrafter, contentAiConfigFromEnv } from "../src/content-ai.ts";
import { draftFixture } from "./content-fixtures.mjs";
const passage = {
  editionId: "fixture",
  editionTitle: "Synthetic test edition",
  manifestSha256: "a".repeat(64),
  corpusSha256: "b".repeat(64),
  source: "bible",
  book: "james",
  chapter: 1,
  fromVerse: 1,
  toVerse: 1,
  reference: "James 1:1",
  sourceUrl: "https://example.test/james/1",
  passageKey: "fixture:james:1:1-1",
  verses: [{ book: "james", chapter: 1, verse: 1, text: "Synthetic source text, not scripture." }],
  context: [],
};
const config = { enabled: true, apiKey: "fixture-key-not-real", model: "configured-test-model" };
const result = {
  outcome: "draft",
  passageKey: passage.passageKey,
  reason: "",
  draft: draftFixture,
};
function response(output = result, extra = {}) {
  return Response.json({
    id: "resp_fixture",
    model: "configured-test-model",
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    ...extra,
  });
}
test("AI is disabled by default and requires explicit server configuration", async () => {
  assert.deepEqual(contentAiConfigFromEnv({}), {
    enabled: false,
    apiKey: undefined,
    model: undefined,
  });
  await assert.rejects(
    new ContentDrafter({}, () => {
      throw new Error("must not call");
    }).draft(passage),
    { code: "AI_DISABLED" },
  );
  await assert.rejects(new ContentDrafter({ enabled: true }).draft(passage), {
    code: "AI_UNAVAILABLE",
  });
});
test("one structured, non-stored call produces provenance without inventing a reference", async () => {
  let calls = 0;
  const drafter = new ContentDrafter(config, async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined);
    assert.ok(body.max_output_tokens <= 3000);
    assert.match(body.input[1].content, /Synthetic source text/);
    return response();
  });
  const generated = await drafter.draft(passage, "Service");
  assert.equal(calls, 1);
  assert.equal(generated.outcome, "draft");
  assert.equal(generated.provenance.kind, "openai");
  assert.equal(generated.provenance.requestId, "resp_fixture");
  assert.match(generated.provenance.inputSha256, /^[a-f0-9]{64}$/);
});
test("wrong passage, HTML, incomplete output and refusal are rejected", async () => {
  for (const output of [
    { ...result, passageKey: "invented" },
    { ...result, draft: { ...draftFixture, action: "<script>bad</script>" } },
    { ...result, draft: { ...draftFixture, minutes: 300 } },
    { ...result, reason: "contradictory reason" },
  ])
    await assert.rejects(new ContentDrafter(config, async () => response(output)).draft(passage), {
      code: "AI_OUTPUT_INVALID",
    });
  await assert.rejects(
    new ContentDrafter(config, async () => response(result, { status: "incomplete" })).draft(
      passage,
    ),
    { code: "AI_OUTPUT_INVALID" },
  );
  await assert.rejects(
    new ContentDrafter(config, async () =>
      response(result, { output: [{ type: "message", content: [{ type: "refusal" }] }] }),
    ).draft(passage),
    { code: "AI_REFUSED" },
  );
  const insufficient = await new ContentDrafter(config, async () =>
    response({
      outcome: "insufficient_context",
      passageKey: passage.passageKey,
      reason: "More surrounding context is required.",
      draft: null,
    }),
  ).draft(passage);
  assert.equal(insufficient.outcome, "insufficient_context");
});
test("provider failure, timeout, and oversized output do not trigger paid automatic retries", async () => {
  let calls = 0;
  await assert.rejects(
    new ContentDrafter(config, async () => {
      calls++;
      return new Response("", { status: 429 });
    }).draft(passage),
    { code: "AI_RATE_LIMIT" },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    new ContentDrafter(config, async () => new Response("x".repeat(128001))).draft(passage),
    { code: "AI_OUTPUT_INVALID" },
  );
  await assert.rejects(
    new ContentDrafter(
      { ...config, timeoutMs: 100 },
      async (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    ).draft(passage),
    { code: "AI_TIMEOUT" },
  );
});

test(
  "drafting has a total deadline even if transport ignores abort, and discards late response bodies",
  { timeout: 2000 },
  async () => {
    let resolveResponse;
    let signal;
    let calls = 0;
    const pending = new ContentDrafter({ ...config, timeoutMs: 100 }, (_url, init) => {
      calls++;
      signal = init.signal;
      return new Promise((resolve) => {
        resolveResponse = resolve;
      });
    }).draft(passage);
    await assert.rejects(pending, { code: "AI_TIMEOUT" });
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
    let cancelled = false;
    resolveResponse(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled, true, "A timed-out call does not keep a late unread response body.");
  },
);

test(
  "drafting deadline covers a stalled response body without waiting for cancellation",
  { timeout: 2000 },
  async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"id":'));
      },
      cancel() {
        cancelled = true;
        return new Promise(() => {});
      },
    });
    await assert.rejects(
      new ContentDrafter({ ...config, timeoutMs: 100 }, async () => new Response(stream)).draft(
        passage,
      ),
      { code: "AI_TIMEOUT" },
    );
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false, "The reader is released even when cancellation is pending.");
  },
);

test(
  "rejected and oversized AI responses report their cause without blocking on body cancellation",
  { timeout: 2000 },
  async () => {
    for (const status of [429, 200]) {
      let cancelled = false;
      const stream = new ReadableStream({
        start(controller) {
          if (status === 200) controller.enqueue(new Uint8Array(128001));
        },
        cancel() {
          cancelled = true;
          return new Promise(() => {});
        },
      });
      await assert.rejects(
        new ContentDrafter(
          { ...config, timeoutMs: 100 },
          async () => new Response(stream, { status }),
        ).draft(passage),
        { code: status === 429 ? "AI_RATE_LIMIT" : "AI_OUTPUT_INVALID" },
      );
      assert.equal(cancelled, true);
      assert.equal(stream.locked, false);
    }
  },
);
