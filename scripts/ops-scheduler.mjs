import { setTimeout as delay } from "node:timers/promises";
import { operationsOrigin } from "./ops-common.mjs";

const origin = operationsOrigin(process.env.APP_ORIGIN);
const secret = process.env.CRON_SECRET?.trim();
if (!secret || secret.length < 32)
  throw new Error("Configure CRON_SECRET before starting the scheduler.");
const controller = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => controller.abort());
async function loop(path, offset) {
  await delay(offset, undefined, { signal: controller.signal });
  while (!controller.signal.aborted) {
    const started = Date.now();
    try {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
        redirect: "error",
      });
      await response.body?.cancel();
      console.log(
        JSON.stringify({
          event: "scheduled_job",
          job: path,
          status: response.status,
          ok: response.ok,
          at: new Date().toISOString(),
        }),
      );
    } catch {
      if (!controller.signal.aborted)
        console.error(
          JSON.stringify({
            event: "scheduled_job_failed",
            job: path,
            at: new Date().toISOString(),
          }),
        );
    }
    // Never overlap the same endpoint or immediately retry an uncertain send operation.
    const next = 60000 - ((Date.now() - started) % 60000);
    await delay(next, undefined, { signal: controller.signal });
  }
}
await Promise.allSettled([loop("/api/jobs/deliver", 0), loop("/api/jobs/maintenance", 30000)]);
