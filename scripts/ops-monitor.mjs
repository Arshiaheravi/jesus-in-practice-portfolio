import { operationsOrigin } from "./ops-common.mjs";

const aggregateNumber = (value) => Number.isSafeInteger(value) && value >= 0;
function validateReport(body) {
  if (
    !body ||
    typeof body !== "object" ||
    body.scope !== "database-and-configuration" ||
    body.externalServicesVerified !== false ||
    typeof body.ready !== "boolean" ||
    typeof body.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(body.checkedAt)) ||
    new Date(body.checkedAt).toISOString() !== body.checkedAt ||
    !Array.isArray(body.checks) ||
    body.checks.length === 0 ||
    body.checks.length > 128
  )
    throw new Error("Readiness contract is invalid.");
  const codes = new Set();
  for (const check of body.checks) {
    if (
      !check ||
      typeof check !== "object" ||
      typeof check.code !== "string" ||
      check.code.length > 100 ||
      !/^[a-z][a-z0-9_]*(?::[a-z][a-zA-Z0-9_]*)?$/.test(check.code) ||
      codes.has(check.code) ||
      !["pass", "warn", "fail"].includes(check.status) ||
      (check.count !== undefined && !aggregateNumber(check.count)) ||
      (check.ageSeconds !== undefined &&
        check.ageSeconds !== null &&
        !aggregateNumber(check.ageSeconds))
    )
      throw new Error("Readiness contract is invalid.");
    codes.add(check.code);
  }
  // A top-level success must never conceal a failed check or malformed log fields.
  if (body.ready !== !body.checks.some((check) => check.status === "fail"))
    throw new Error("Readiness contract is inconsistent.");
}

export async function checkReadiness({ origin, secret, fetcher = fetch }) {
  const base = operationsOrigin(origin);
  const effectiveSecret = secret?.trim();
  if (!effectiveSecret || effectiveSecret.length < 32)
    throw new Error("MONITORING_SECRET must be configured.");
  // Bound the complete operation, even if the response body stops delivering bytes.
  const controller = new AbortController();
  let reader;
  let timeout;
  const cancel = () => {
    controller.abort();
    // Cancellation is cleanup, not another unbounded prerequisite for returning.
    void reader?.cancel().catch(() => {});
  };
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      cancel();
      reject(new Error("Readiness request timed out."));
    }, 15000);
  });
  async function readReport() {
    const response = await fetcher(`${base}/api/jobs/readiness`, {
      headers: { Authorization: `Bearer ${effectiveSecret}` },
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    controller.signal.throwIfAborted();
    reader = response.body?.getReader();
    if (!reader) throw new Error("Readiness response is empty.");
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 65536) {
        cancel();
        throw new Error("Readiness response exceeds its limit.");
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    validateReport(body);
    return {
      healthy: response.ok && body.ready,
      status: response.status,
      checkedAt: body.checkedAt,
      scope: body.scope,
      externalServicesVerified: false,
      checks: body.checks.map(({ code, status, count, ageSeconds }) => ({
        code,
        status,
        count,
        ageSeconds,
      })),
    };
  }
  try {
    return await Promise.race([readReport(), deadline]);
  } finally {
    clearTimeout(timeout);
    reader?.releaseLock();
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/ops-monitor.mjs")) {
  try {
    const result = await checkReadiness({
      origin: process.env.APP_ORIGIN,
      secret: process.env.MONITORING_SECRET,
    });
    console.log(JSON.stringify(result));
    if (!result.healthy) process.exitCode = 1;
  } catch {
    console.error(
      JSON.stringify({
        healthy: false,
        error:
          "Readiness unavailable; inspect the configured endpoint and monitoring secret securely.",
      }),
    );
    process.exitCode = 1;
  }
}
