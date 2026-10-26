import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

import * as tokens from "../../../packages/backend/src/tokens.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const nextServer = require("next/server");
const appOrigin = "https://member.example.test";
const signingSecret = "isolated-unsubscribe-fixture-secret-123456789";
const environment = {
  NEXT_PUBLIC_APP_MODE: "live",
  APP_ORIGIN: appOrigin,
  UNSUBSCRIBE_SIGNING_SECRET: signingSecret,
};
const previousEnvironment = new Map();
let config;
let http;

// Execute the actual application source. Only explicitly supplied module boundaries are mocked;
// no server, provider request, database, alias loader, or new test dependency is needed.
async function loadSource(relativePath, dependencies) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  });
  const loadedModule = { exports: {} };
  const localRequire = (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", outputText)(
    localRequire,
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}

before(async () => {
  for (const [name, value] of Object.entries(environment)) {
    previousEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
  config = await loadSource("../lib/server/config.ts", { "server-only": {} });
  http = await loadSource("../lib/server/http.ts", {
    "server-only": {},
    "node:crypto": crypto,
    "next/server": nextServer,
    "./config": config,
  });
});
after(() => {
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function assertWrapperHeaders(response) {
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
}

test("Twilio status success and duplicate acknowledgement preserve an empty 204 through the actual route wrapper", async () => {
  const deliveryId = "11111111-1111-4111-8111-111111111111";
  const messageSid = `SM${"1".repeat(32)}`;
  const destination = "+14165550123";
  const callbackUrl = `${appOrigin}/api/webhooks/twilio/status?deliveryId=${deliveryId}`;
  const raw = new URLSearchParams({
    MessageSid: messageSid,
    MessageStatus: "delivered",
    To: destination,
  }).toString();
  const processed = new Set();
  const completed = [];
  const transitions = [];
  let verified = 0;
  const repo = {
    async recordWebhook(provider, eventId, hash) {
      assert.equal(provider, "twilio");
      assert.equal(eventId, hash);
      return { processed: processed.has(eventId) };
    },
    async completeWebhook(provider, eventId) {
      assert.equal(provider, "twilio");
      completed.push(eventId);
      processed.add(eventId);
    },
  };
  const { POST } = await loadSource("../app/api/webhooks/twilio/status/route.ts", {
    "node:crypto": crypto,
    "@jesus-in-practice/backend/operational": {
      DeliveryStore: class {
        constructor(repository) {
          assert.equal(repository, repo);
        }
        async get(id) {
          assert.equal(id, deliveryId);
          return { channel: "sms", payload: { to: destination } };
        }
        async finish(...args) {
          transitions.push(args);
        }
      },
    },
    "@/lib/server/config": config,
    "@/lib/server/http": http,
    "@/lib/server/providers": {
      twilio: () => ({
        verifyWebhook(input) {
          verified++;
          assert.deepEqual(input, {
            rawBody: raw,
            signature: "mock-signature",
            url: callbackUrl,
          });
          return { MessageSid: messageSid, MessageStatus: "delivered", To: destination };
        },
      }),
    },
    "@/lib/server/runtime": { repository: () => repo },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await POST(
      new Request(callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": "mock-signature",
        },
        body: raw,
      }),
    );
    assert.equal(response.status, 204);
    assert.equal(response.body, null);
    assert.equal(await response.text(), "");
    assertWrapperHeaders(response);
  }
  assert.equal(verified, 2, "provider verification boundary runs on every request");
  assert.deepEqual(transitions, [[deliveryId, "delivered", messageSid]]);
  assert.equal(completed.length, 1);
});

test("HTML unsubscribe uses a writable 303 redirect and retains route headers after destination suppression", async () => {
  const destinationHash = "c".repeat(64);
  const token = tokens.unsubscribeToken(
    signingSecret,
    "22222222-2222-4222-8222-222222222222",
    "email",
    destinationHash,
  );
  const suppressions = [];
  const { POST } = await loadSource("../app/api/unsubscribe/route.ts", {
    "@jesus-in-practice/backend/tokens": tokens,
    "next/server": nextServer,
    "@/lib/server/config": config,
    "@/lib/server/http": http,
    "@/lib/server/runtime": {
      repository: () => ({
        async suppressDestination(...args) {
          suppressions.push(args);
        },
      }),
    },
  });
  const response = await POST(
    new Request(`${appOrigin}/api/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { accept: "text/html", "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${appOrigin}/unsubscribe?complete=1`);
  assert.equal(response.body, null);
  assertWrapperHeaders(response);
  assert.deepEqual(suppressions, [["email", destinationHash, "unsubscribe"]]);
});

test("request body timeout is one total budget despite arriving chunks and cancels the reader", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let controller;
  let cancelled = false;
  const stream = new ReadableStream({
    start(value) {
      controller = value;
    },
    cancel() {
      cancelled = true;
    },
  });
  const result = http.boundedText({ headers: new Headers(), body: stream }, 1_000, 100).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const flush = async () => {
    for (let step = 0; step < 5; step++) await Promise.resolve();
  };
  for (let chunk = 0; chunk < 3; chunk++) {
    context.mock.timers.tick(25);
    controller.enqueue(new TextEncoder().encode("a"));
    await flush();
  }
  context.mock.timers.tick(30);
  await flush();
  // Closing after the total budget makes a mistakenly renewed per-chunk timeout fail promptly.
  if (!cancelled) controller.close();
  const outcome = await result;
  assert.equal(outcome.error?.code, "REQUEST_TIMEOUT");
  assert.equal(outcome.error?.status, 408);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
