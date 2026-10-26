import assert from "node:assert/strict";
import test from "node:test";

import { practices } from "@jesus-in-practice/content";
import { renderPracticeEmail, renderPracticeSms } from "../src/messages.ts";
import { analyzeSms, enforceSmsLimit, normalizeSmsPunctuation } from "../src/sms.ts";

const options = {
  senderName: "Jesus in Practice",
  mailingAddress: "TEST FIXTURE ADDRESS — NOT FOR SENDING",
  supportEmail: "support@example.test",
  unsubscribeUrl: "https://app.example.test/unsubscribe?t=opaque-token",
  practiceUrl: "https://example.test/practices/notice-your-neighbour",
};

test("SMS counts single and toll-free multipart encoding boundaries", () => {
  for (const [text, encoding, units, segments] of [
    ["", "GSM-7", 0, 0],
    ["a".repeat(160), "GSM-7", 160, 1],
    ["a".repeat(161), "GSM-7", 161, 2],
    ["a".repeat(304), "GSM-7", 304, 2],
    ["a".repeat(305), "GSM-7", 305, 3],
    ["漢".repeat(70), "UCS-2", 70, 1],
    ["漢".repeat(71), "UCS-2", 71, 2],
    ["漢".repeat(132), "UCS-2", 132, 2],
    ["漢".repeat(133), "UCS-2", 133, 3],
    ["^{}\\[~]|€\f", "GSM-7", 20, 1],
    ["😀".repeat(35), "UCS-2", 70, 1],
    ["😀".repeat(36), "UCS-2", 72, 2],
    ["a".repeat(151) + "^" + "a".repeat(151), "GSM-7", 304, 3],
    ["漢".repeat(65) + "😀" + "漢".repeat(65), "UCS-2", 132, 3],
  ]) {
    const result = analyzeSms(text);
    assert.equal(result.encoding, encoding);
    assert.equal(result.units, units);
    assert.equal(result.segments, segments);
  }
});

test("SMS punctuation is predictable and caps reject rather than truncate", () => {
  assert.equal(normalizeSmsPunctuation("“Hello”—‘friend’…\u00a0"), "\"Hello\"-'friend'... ");
  assert.throws(() => enforceSmsLimit("a".repeat(161), 1), /SMS_SEGMENT_LIMIT/);
  assert.throws(() => enforceSmsLimit("", 2), /SMS_SEGMENT_LIMIT/);
  assert.throws(() => enforceSmsLimit("Hello", 0), /segment cap/);
  assert.throws(() => enforceSmsLimit("Hello", 1.5), /segment cap/);
  assert.throws(() => enforceSmsLimit("Hello", 11), /segment cap/);
});

test("all 24 original lessons render attributed, complete email and bounded SMS", () => {
  assert.equal(practices.length, 24);
  for (const practice of practices) {
    const email = renderPracticeEmail(practice, options);
    for (const value of [
      practice.reference,
      practice.plainMeaning,
      practice.everydayExample,
      practice.action,
      practice.reflection,
      practice.sourceUrl,
    ]) {
      assert.ok(email.text.includes(value), `${practice.id}: missing ${value}`);
    }
    for (const label of [
      "In plain language",
      "In real life",
      "Try this today",
      "About the passage",
    ])
      assert.ok(email.html.includes(label));
    assert.equal(email.headers["List-Unsubscribe"], `<${options.unsubscribeUrl}>`);
    assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(email.text.includes(options.mailingAddress));
    const sms = renderPracticeSms(practice, {
      senderName: options.senderName,
      informationUrl: "https://example.test/message-info",
      maxSegments: 10,
    });
    for (const value of [
      practice.reference,
      practice.plainMeaning,
      practice.everydayExample,
      practice.action,
    ])
      assert.ok(sms.body.includes(normalizeSmsPunctuation(value)));
    assert.ok(sms.body.startsWith(options.senderName));
    assert.ok(sms.body.includes("STOP to unsubscribe"));
    assert.ok(sms.body.includes("Our reflection, not a quotation."));
    assert.equal(sms.encoding, "GSM-7");
    assert.ok(sms.segments >= 2 && sms.segments <= 10);
  }
});

test("email escapes text and URLs and refuses unsafe headers or schemes", () => {
  const practice = {
    ...practices[0],
    title: '<img src=x onerror="alert(1)">',
    action: '<script>bad()</script> & "quoted"',
  };
  const email = renderPracticeEmail(practice, options);
  assert.ok(!email.html.includes("<script>"));
  assert.ok(!email.html.includes("<img src=x"));
  assert.ok(email.html.includes("&lt;script&gt;bad()&lt;/script&gt; &amp; &quot;quoted&quot;"));
  assert.ok(email.text.includes(practice.action));
  assert.throws(
    () => renderPracticeEmail(practices[0], { ...options, unsubscribeUrl: "javascript:alert(1)" }),
    /URL/,
  );
  assert.throws(
    () =>
      renderPracticeEmail(practices[0], {
        ...options,
        senderName: "Sender\r\nBcc: other@example.test",
      }),
    /configured/,
  );
  assert.throws(
    () =>
      renderPracticeEmail(practices[0], {
        ...options,
        supportEmail: "x@example.test\r\nBcc: other@example.test",
      }),
    /support email/,
  );
  assert.throws(
    () => renderPracticeEmail(practices[0], { ...options, mailingAddress: "" }),
    /configured/,
  );
});
