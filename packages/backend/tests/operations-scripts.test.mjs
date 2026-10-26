import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { databaseTarget, operationsOrigin, verifyTarget } from "../../../scripts/ops-common.mjs";
import { checkReadiness } from "../../../scripts/ops-monitor.mjs";

test("operations reject ambiguous targets and remote TLS downgrade", () => {
  assert.throws(() => databaseTarget(undefined));
  assert.throws(() => databaseTarget("https://example.test/data"));
  assert.throws(() =>
    databaseTarget("postgresql://fixture:synthetic@example.test/a%20host%3Devil"),
  );
  const target = databaseTarget(
    "postgresql://fixture:synthetic@example.test:5433/fixture?sslmode=disable",
  );
  assert.equal(target.identity, "example.test:5433/fixture");
  assert.equal(target.connection.ssl.rejectUnauthorized, true);
  assert.equal(target.utilityEnv.PGSSLMODE, "verify-full");
  assert.ok(!target.connection.connectionString.includes("sslmode"));
  for (const option of [
    "host=other.example.test",
    "port=6543",
    "user=other",
    "ssl=0",
    "uselibpqcompat=true",
  ])
    assert.throws(
      () => databaseTarget(`postgresql://fixture:synthetic@example.test:5433/fixture?${option}`),
      /overrides/,
    );
  const previous = {
    PGHOSTADDR: process.env.PGHOSTADDR,
    PGSERVICE: process.env.PGSERVICE,
    PGSERVICEFILE: process.env.PGSERVICEFILE,
  };
  try {
    Object.assign(process.env, {
      PGHOSTADDR: "192.0.2.1",
      PGSERVICE: "synthetic-service",
      PGSERVICEFILE: "synthetic-service-file",
    });
    const isolated = databaseTarget("postgresql://fixture:synthetic@[::1]:55439/fixture");
    assert.equal(isolated.utilityEnv.PGHOST, "::1");
    for (const key of Object.keys(previous)) assert.equal(isolated.utilityEnv[key], undefined);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.throws(() => verifyTarget(target, "other.test:5433/fixture"));
  verifyTarget(target, "example.test:5433/fixture");
  assert.throws(() => operationsOrigin("http://remote.example.test"));
  assert.throws(() => operationsOrigin("https://user:pass@remote.example.test"));
  assert.equal(operationsOrigin("http://127.0.0.1:3002"), "http://127.0.0.1:3002");
});

test("mocked monitoring authenticates only the canonical endpoint and rejects malformed responses", async () => {
  const secret = "synthetic-monitoring-secret-123456789";
  let request;
  const result = await checkReadiness({
    origin: "https://app.example.test",
    secret,
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(
        JSON.stringify({
          ready: false,
          checkedAt: "2026-10-17T00:00:00.000Z",
          scope: "database-and-configuration",
          externalServicesVerified: false,
          checks: [{ code: "queue_lag", status: "fail", count: 2, privateField: "never output" }],
        }),
        { status: 503 },
      );
    },
  });
  assert.equal(request.url, "https://app.example.test/api/jobs/readiness");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers.Authorization, `Bearer ${secret}`);
  assert.equal(result.healthy, false);
  assert.ok(!JSON.stringify(result).includes("privateField"));
  await assert.rejects(
    checkReadiness({
      origin: "https://app.example.test",
      secret,
      fetcher: async () => new Response("{}"),
    }),
    /contract/,
  );
  await assert.rejects(
    checkReadiness({
      origin: "https://app.example.test",
      secret,
      fetcher: async () => new Response("x".repeat(65537)),
    }),
    /exceeds/,
  );
});

test(
  "monitor exits when a real HTTP response stalls after headers",
  { timeout: 25000 },
  async () => {
    const secret = "synthetic-monitoring-secret-123456789";
    let requests = 0;
    let requestStarted;
    let connectionClosed;
    let closeConnection;
    const closedConnection = new Promise((resolve) => {
      closeConnection = resolve;
    });
    const server = createServer((request, response) => {
      requests++;
      requestStarted = Date.now();
      assert.equal(request.url, "/api/jobs/readiness");
      assert.equal(request.method, "GET");
      assert.equal(request.headers.authorization, `Bearer ${secret}`);
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"privateField":"synthetic-private-body",');
      response.on("close", () => {
        connectionClosed = Date.now();
        closeConnection();
      });
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    let child;
    let guard;
    try {
      child = spawn(
        process.execPath,
        [fileURLToPath(new URL("../../../scripts/ops-monitor.mjs", import.meta.url))],
        {
          env: {
            APP_ORIGIN: `http://127.0.0.1:${server.address().port}`,
            MONITORING_SECRET: secret,
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const closed = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code));
      });
      const [exitCode] = await Promise.race([
        Promise.all([closed, closedConnection]),
        new Promise((_, reject) => {
          guard = setTimeout(() => reject(new Error("Monitor did not honor its deadline.")), 21000);
        }),
      ]);
      assert.equal(exitCode, 1);
      assert.equal(requests, 1);
      assert.ok(connectionClosed - requestStarted >= 14000);
      assert.ok(connectionClosed - requestStarted < 20000);
      assert.equal(stdout, "");
      assert.equal(JSON.parse(stderr).healthy, false);
      assert.equal(stderr.includes(secret), false);
      assert.equal(stderr.includes("synthetic-private-body"), false);
    } finally {
      clearTimeout(guard);
      child?.kill();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test(
  "monitor rejects an oversized body without waiting for a stalled cancellation hook",
  { timeout: 2000 },
  async () => {
    let signal;
    let cancellations = 0;
    await assert.rejects(
      checkReadiness({
        origin: "https://app.example.test",
        secret: "synthetic-monitoring-secret-123456789",
        fetcher: async (_url, options) => {
          signal = options.signal;
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(65537));
              },
              cancel() {
                cancellations++;
                return new Promise(() => {});
              },
            }),
          );
        },
      }),
      /exceeds/,
    );
    assert.equal(signal.aborted, true);
    assert.equal(cancellations, 1);
  },
);

const readinessReport = (changes = {}) => ({
  ready: true,
  checkedAt: "2026-10-21T12:00:00.000Z",
  scope: "database-and-configuration",
  externalServicesVerified: false,
  checks: [
    { code: "config:operatorIdentity", status: "pass" },
    { code: "database", status: "pass" },
    { code: "planner_freshness", status: "pass", ageSeconds: 12 },
    { code: "blocked_wallets", status: "warn", count: 1 },
  ],
  ...changes,
});
const monitorFixture = (report, status = 200) =>
  checkReadiness({
    origin: "https://app.example.test",
    secret: "synthetic-monitoring-secret-123456789",
    fetcher: async () => new Response(JSON.stringify(report), { status }),
  });

test("monitor rejects short effective secrets before any request", async () => {
  let requests = 0;
  for (const secret of [" ".repeat(32), ` \t${"m".repeat(31)}\n `]) {
    await assert.rejects(
      checkReadiness({
        origin: "https://app.example.test",
        secret,
        fetcher: async () => {
          requests++;
          return new Response(JSON.stringify(readinessReport()));
        },
      }),
      /MONITORING_SECRET must be configured/,
    );
  }
  assert.equal(requests, 0);
});

test("monitor sends only the trimmed effective bearer secret", async () => {
  const secret = "m".repeat(32);
  let requests = 0;
  const result = await checkReadiness({
    origin: "https://app.example.test",
    secret: ` \t${secret}\n `,
    fetcher: async (url, options) => {
      requests++;
      assert.equal(url, "https://app.example.test/api/jobs/readiness");
      assert.equal(options.headers.Authorization, `Bearer ${secret}`);
      return new Response(JSON.stringify(readinessReport()));
    },
  });
  assert.equal(requests, 1);
  assert.equal(result.healthy, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("scheduler validates and sends the trimmed secret with timers and requests isolated", () => {
  const schedulerUrl = new URL("../../../scripts/ops-scheduler.mjs", import.meta.url).href;
  // Run the actual entrypoint in a fresh process with synthetic settings and no real I/O.
  // Only the immediate delivery iteration runs; later waits end at the timer boundary.
  const fixture = `
    import assert from "node:assert/strict";
    import timers from "node:timers/promises";
    import { syncBuiltinESMExports } from "node:module";
    timers.setTimeout = async (milliseconds) => {
      if (milliseconds > 0) throw new Error("Fixture stopped a delayed iteration.");
    };
    syncBuiltinESMExports();
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return new Response("{}");
    };
    if (process.env.FIXTURE_VALID === "true") {
      await import(${JSON.stringify(schedulerUrl)});
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "https://app.example.test/api/jobs/deliver");
      assert.equal(requests[0].options.method, "POST");
      assert.equal(requests[0].options.redirect, "error");
      assert.equal(requests[0].options.headers.Authorization, "Bearer " + "c".repeat(32));
    } else {
      await assert.rejects(import(${JSON.stringify(schedulerUrl)}), /Configure CRON_SECRET/);
      assert.equal(requests.length, 0);
    }
  `;
  for (const [secret, valid] of [
    [" ".repeat(32), false],
    [` \t${"c".repeat(31)}\n `, false],
    [` \t${"c".repeat(32)}\n `, true],
  ]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", fixture], {
      env: {
        APP_ORIGIN: "https://app.example.test",
        CRON_SECRET: secret,
        FIXTURE_VALID: String(valid),
      },
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.equal(result.stdout.includes("c".repeat(31)), false);
  }
});

test("monitor preserves warnings and safe aggregate fields without claiming provider verification", async () => {
  const report = readinessReport({
    privateField: "synthetic-private-data",
    checks: [
      { code: "database", status: "pass", privateField: "synthetic-private-data" },
      { code: "blocked_wallets", status: "warn", count: 1, privateField: "synthetic-private-data" },
    ],
  });
  const result = await monitorFixture(report);
  assert.equal(result.healthy, true);
  assert.equal(result.scope, "database-and-configuration");
  assert.equal(result.externalServicesVerified, false);
  assert.equal(result.checks[1].status, "warn");
  assert.equal(result.checks[1].count, 1);
  assert.equal(JSON.stringify(result).includes("synthetic-private-data"), false);
  assert.equal((await monitorFixture(report, 503)).healthy, false);

  const unavailable = await monitorFixture(
    readinessReport({
      ready: false,
      checks: [{ code: "planner_freshness", status: "fail", ageSeconds: null }],
    }),
    503,
  );
  assert.equal(unavailable.healthy, false);
  assert.equal(unavailable.checks[0].ageSeconds, null);
});

test("monitor rejects inconsistent readiness and invalid aggregate fields", async () => {
  const invalidReports = [
    null,
    [],
    readinessReport({ ready: false }),
    readinessReport({ checks: [{ code: "database", status: "fail" }] }),
    readinessReport({ scope: "provider-verification" }),
    readinessReport({ externalServicesVerified: true }),
    readinessReport({ checkedAt: { privateField: "synthetic-private-data" } }),
    readinessReport({ checkedAt: "invalid date" }),
    readinessReport({ checkedAt: "2026-02-30T00:00:00.000Z" }),
    readinessReport({ checks: [] }),
    readinessReport({
      checks: Array.from({ length: 129 }, (_, i) => ({ code: `check_${i}`, status: "pass" })),
    }),
    readinessReport({
      checks: [
        { code: "database", status: "pass" },
        { code: "database", status: "pass" },
      ],
    }),
    ...[
      null,
      [],
      { code: "database", status: "unknown" },
      { code: { privateField: "synthetic-private-data" }, status: "pass" },
      { code: "reader@example.test", status: "pass" },
      { code: "a".repeat(101), status: "pass" },
      { code: "database", status: "pass", count: "1" },
      { code: "database", status: "pass", count: -1 },
      { code: "database", status: "pass", count: 1.5 },
      { code: "database", status: "pass", count: Number.MAX_SAFE_INTEGER + 1 },
      { code: "database", status: "pass", ageSeconds: { privateField: "synthetic-private-data" } },
      { code: "database", status: "pass", ageSeconds: -1 },
      { code: "database", status: "pass", ageSeconds: 1.5 },
    ].map((check) => readinessReport({ checks: [check] })),
  ];
  for (const report of invalidReports) {
    await assert.rejects(monitorFixture(report), /Readiness contract is (invalid|inconsistent)/);
  }
});
