/** Runs only against this workspace's loopback portable PostgreSQL fixture. */
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { argument, loadPg } from "./ops-common.mjs";
import { readFixtureConnection } from "./test-postgres-fixture.mjs";

if (!process.argv.includes("--run")) throw new Error("Explicit --run is required.");
const workspace = fileURLToPath(new URL("..", import.meta.url));
const file = resolve(argument("--connection-file") || "");
if (!file.startsWith(resolve(workspace, ".local") + sep))
  throw new Error("Use the ignored local fixture connection file.");
const fixture = await readFixtureConnection(file);
const name = `jip_integration_${Date.now()}_${randomBytes(3).toString("hex")}`;
const admin = new (loadPg().Client)(fixture);
try {
  await admin.connect();
  await admin.query(`create database "${name}"`);
} finally {
  await admin.end();
}
const url = new URL(`postgresql://${fixture.host}:${fixture.port}/${name}`);
url.username = fixture.user;
url.password = fixture.password;
const evidenceDirectory = resolve(workspace, ".local", "postgres-integration", "runs");
await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
const tapLog = resolve(evidenceDirectory, `${name}.tap`);
let output = "";
const child = spawn(
  process.execPath,
  ["--experimental-strip-types", "--test", "packages/backend/tests/postgres-integration.mjs"],
  {
    cwd: workspace,
    env: {
      ...process.env,
      PGOPTIONS: fixture.options,
      RUN_POSTGRES_INTEGRATION: "true",
      TEST_DATABASE_URL: url.href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  },
);
child.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  output += chunk;
  process.stderr.write(chunk);
});
const code = await new Promise((accept, reject) => {
  child.once("error", reject);
  child.once("close", accept);
});
await writeFile(tapLog, output, { flag: "wx", mode: 0o600 });
const evidence = {
  synthetic: true,
  database: name,
  passed: code === 0,
  exitCode: code,
  completedAt: new Date().toISOString(),
  tapLog,
};
await writeFile(
  resolve(evidenceDirectory, `${name}.json`),
  `${JSON.stringify(evidence, null, 2)}\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify(evidence));
process.exitCode = code ?? 1;
