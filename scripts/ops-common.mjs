import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(new URL("../packages/backend/package.json", import.meta.url));
export const loadPg = () => require("pg");
export class OperationsError extends Error {}
export function databaseTarget(raw) {
  if (!raw)
    throw new OperationsError("Supply the intended database URL through the process environment.");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new OperationsError("PostgreSQL URL required.");
  // node-postgres accepts routing and TLS overrides in query parameters. The checked
  // authority must identify the same database used by both JS and libpq utilities.
  const allowedOptions = new Set([
    "application_name",
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
  ]);
  if (url.hash || [...url.searchParams.keys()].some((key) => !allowedOptions.has(key)))
    throw new OperationsError(
      "Use the explicit URL authority for database identity; unsupported connection overrides are rejected.",
    );
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(database) || !url.username)
    throw new OperationsError(
      "Database must use a simple explicit identifier and user must be explicit.",
    );
  const port = url.port || "5432";
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const identity = `${url.hostname}:${port}/${database}`;
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const utilityEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"].includes(key.toUpperCase()),
    ),
  );
  return {
    identity,
    local,
    connection: {
      connectionString: url.href,
      connectionTimeoutMillis: 10000,
      ...(local
        ? { ssl: false }
        : {
            ssl: {
              rejectUnauthorized: true,
              ...(process.env.DATABASE_CA_CERT
                ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
                : {}),
            },
          }),
    },
    utilityEnv: {
      ...utilityEnvironment,
      PGHOST: url.hostname.replace(/^\[(.*)\]$/, "$1"),
      PGPORT: port,
      PGDATABASE: database,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: local ? "disable" : "verify-full",
      PGCONNECT_TIMEOUT: "10",
    },
  };
}
export function verifyTarget(target, expected) {
  if (!expected || target.identity !== expected)
    throw new OperationsError(
      "Target does not match --expect-target host:port/database. No operation performed.",
    );
}
export function pgUtility(name) {
  if (!process.env.PG_BIN_DIR)
    throw new OperationsError("Set PG_BIN_DIR to reviewed PostgreSQL binaries.");
  return resolve(process.env.PG_BIN_DIR, `${name}${process.platform === "win32" ? ".exe" : ""}`);
}
export function launchUtility(name, args, env) {
  const child = spawn(pgUtility(name), args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  // Raw stderr can contain identifiers and data. Keep it out of normal logs.
  child.stderr.resume();
  const done = new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new OperationsError(`${name} exceeded its 10-minute limit.`));
    }, 600000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new OperationsError(`${name} could not start.`));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? accept()
        : reject(new OperationsError(`${name} failed; inspect this database securely.`));
    });
  });
  // Consumers attach their own await after setting up streams.
  done.catch(() => {});
  return { child, done };
}
export function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
export function operationsOrigin(raw) {
  const url = new URL(raw || "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (!local && url.protocol !== "https:") ||
    (local && !["http:", "https:"].includes(url.protocol)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new OperationsError(
      "An approved canonical HTTPS APP_ORIGIN is required (loopback HTTP allowed for tests).",
    );
  return url.origin;
}
