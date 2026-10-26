/** Connection boundary for disposable test databases, never application configuration. */
import { open } from "node:fs/promises";

const fields = new Set(["host", "port", "user", "password", "database"]);
const maximumBytes = 4096;

export function parseFixtureConnection(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    throw new Error("Expected a synthetic PostgreSQL fixture configuration object.");
  if (Object.keys(settings).some((key) => !fields.has(key)))
    throw new Error("Unsupported fixture connection options; use the generated configuration.");
  if (
    settings.host !== "127.0.0.1" ||
    settings.port !== 55439 ||
    settings.user !== "jip_test_admin" ||
    typeof settings.database !== "string" ||
    !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(settings.database) ||
    typeof settings.password !== "string" ||
    !settings.password.length ||
    settings.password.length > 1024
  )
    throw new Error("Only the isolated loopback PostgreSQL fixture is accepted.");

  // Never spread input into pg: connectionString and driver hooks can override a
  // separately checked host. Explicit nonempty options also override PGOPTIONS.
  return {
    host: "127.0.0.1",
    port: 55439,
    user: "jip_test_admin",
    password: settings.password,
    database: settings.database,
    ssl: false,
    options: "-c statement_timeout=30000 -c lock_timeout=5000",
    connectionTimeoutMillis: 5000,
    query_timeout: 35000,
  };
}

export async function readFixtureConnection(file) {
  const handle = await open(file, "r");
  try {
    const bytes = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maximumBytes) throw new Error("Fixture connection file exceeds its limit.");
    let settings;
    try {
      settings = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)),
      );
    } catch {
      throw new Error("Fixture connection file must contain valid UTF-8 JSON.");
    }
    return parseFixtureConnection(settings);
  } finally {
    await handle.close();
  }
}
