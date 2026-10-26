/** Local synthetic-data drill only. Never point this fixture bootstrap at a hosted database. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, copyFile, appendFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argument, loadPg } from "./ops-common.mjs";
import { readFixtureConnection } from "./test-postgres-fixture.mjs";
import { createDatabase } from "../packages/backend/src/database.ts";
import { BackendRepository } from "../packages/backend/src/repository.ts";

if (!process.argv.includes("--run")) throw new Error("Local drill requires explicit --run.");
const workspace = fileURLToPath(new URL("..", import.meta.url));
const connectionPath = resolve(argument("--connection-file") || "");
if (!connectionPath.startsWith(resolve(workspace, ".local") + sep))
  throw new Error("Use a fixture connection file beneath the ignored workspace .local directory.");
const fixture = await readFixtureConnection(connectionPath);
// Every fixture connection, including repository pools and utility subprocesses,
// must use these reviewed limits rather than inherited PostgreSQL session options.
process.env.PGOPTIONS = fixture.options;
const suffix = `${Date.now()}_${randomBytes(3).toString("hex")}`;
const source = `jip_ops_source_${suffix}`,
  target = `jip_ops_restore_${suffix}`;
const output = resolve(workspace, ".local", "backup-drills", suffix);
await mkdir(output, { recursive: true, mode: 0o700 });
const urlFor = (database) => {
  const url = new URL(`postgresql://${fixture.host}:${fixture.port}/${database}`);
  url.username = fixture.user;
  url.password = fixture.password;
  return url.href;
};
async function execute(script, args, env, expectFailure = false) {
  const child = spawn(process.execPath, ["--experimental-strip-types", script, ...args], {
    cwd: workspace,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      (expectFailure ? code === 1 : code === 0)
        ? accept()
        : reject(new Error(`Drill command failed: ${script}`)),
    );
  });
  return output;
}
const admin = new (loadPg().Client)({ ...fixture });
try {
  await admin.connect();
  for (const role of ["authenticated", "anon", "service_role"]) {
    const exists = await admin.query("select 1 from pg_roles where rolname=$1", [role]);
    if (!exists.rows.length)
      await admin.query(
        `create role ${role} nologin${role === "service_role" ? " bypassrls" : ""}`,
      );
  }
  await admin.query(`create database "${source}"`);
  await admin.query(`create database "${target}"`);
} finally {
  await admin.end();
}
const seed = new (loadPg().Client)({ ...fixture, database: source });
try {
  await seed.connect();
  await seed.query(`create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
} finally {
  await seed.end();
}
await execute("packages/backend/scripts/migrate.mjs", ["--apply"], {
  DATABASE_URL: urlFor(source),
});
const database = createDatabase(urlFor(source));
const repo = new BackendRepository(database);
const user = randomUUID();
try {
  const owner = new (loadPg().Client)({ ...fixture, database: source });
  try {
    await owner.connect();
    await owner.query("insert into auth.users(id,email) values($1,'backup-fixture@example.test')", [
      user,
    ]);
  } finally {
    await owner.end();
  }
  await repo.ensureProfile(user);
  await repo.mutateMember(user, 1, {
    type: "reflection",
    practiceId: "notice-your-neighbour",
    text: "Synthetic restore fixture, not a real reflection.",
  });
  const checkout = await repo.createCheckout(user, 1000, randomUUID());
  await repo.fundCheckout({
    checkoutId: checkout.id,
    providerSessionId: `cs_fixture_${suffix}`,
    paymentIntentId: `pi_fixture_${suffix}`,
    amountCents: 1000,
    currency: "cad",
    eventId: `evt_fixture_${suffix}`,
  });
} finally {
  await database.close();
}
const key = randomBytes(32).toString("base64");
await writeFile(resolve(output, "encryption-key.txt"), key, { mode: 0o600, flag: "wx" });
const file = resolve(output, "snapshot.jipbackup");
const env = {
  DATABASE_URL: urlFor(source),
  RESTORE_DATABASE_URL: urlFor(target),
  BACKUP_ENCRYPTION_KEY: key,
  // Select the reviewed PostgreSQL 17 tools explicitly; PATH is not consulted.
  PG_BIN_DIR: process.env.PG_BIN_DIR || "",
};
await execute(
  "scripts/ops-backup.mjs",
  ["--expect-target", `127.0.0.1:55439/${source}`, "--output", file],
  env,
);
await execute(
  "scripts/ops-restore.mjs",
  ["--apply", "--confirm-empty", "--expect-target", `127.0.0.1:55439/${target}`, "--input", file],
  env,
);
const restoreArgs = [
  "--apply",
  "--confirm-empty",
  "--expect-target",
  `127.0.0.1:55439/${target}`,
  "--input",
  file,
];
assert.match(
  await execute("scripts/ops-restore.mjs", restoreArgs, env, true),
  /non-empty database/,
);
assert.match(
  await execute(
    "scripts/ops-restore.mjs",
    ["--apply", "--confirm-empty", "--expect-target", `127.0.0.1:55439/${source}`, "--input", file],
    { ...env, RESTORE_DATABASE_URL: urlFor(source) },
    true,
  ),
  /must differ/,
);
assert.match(
  await execute(
    "scripts/ops-restore.mjs",
    restoreArgs,
    { ...env, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("base64") },
    true,
  ),
  /Restore failed/,
);
const damaged = resolve(output, "damaged.jipbackup");
await copyFile(file, damaged);
await copyFile(`${file}.json`, `${damaged}.json`);
await appendFile(damaged, "tampered");
assert.match(
  await execute("scripts/ops-restore.mjs", [...restoreArgs.slice(0, -1), damaged], env, true),
  /checksum mismatch/,
);
const original = await readFile(file);
await execute(
  "scripts/ops-backup.mjs",
  ["--expect-target", `127.0.0.1:55439/${source}`, "--output", file],
  env,
  true,
);
assert.deepEqual(await readFile(file), original, "Existing backup must not be overwritten.");
const restored = new (loadPg().Client)({ ...fixture, database: target });
let evidence;
try {
  await restored.connect();
  const rows = (
    await restored.query(
      "select (select count(*)::int from app.schema_migrations) as migrations,(select count(*)::int from app.credit_ledger) as ledger,(select sum(available_cents)::int from app.wallets) as credit,(select count(*)::int from app.notes) as notes",
    )
  ).rows[0];
  assert.equal(rows.migrations, 9);
  assert.equal(rows.ledger, 1);
  assert.equal(rows.credit, 1000);
  assert.equal(rows.notes, 1);
  await restored.query("begin;set local role authenticated");
  await restored.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: randomUUID(), role: "authenticated" }),
  ]);
  assert.equal((await restored.query("select * from app.notes")).rows.length, 0);
  await restored.query("rollback");
  evidence = {
    completedAt: new Date().toISOString(),
    synthetic: true,
    source,
    target,
    backup: file,
    restoreVerified: true,
    rlsRestored: true,
    negativeChecks: [
      "nonempty-target",
      "source-target-collision",
      "wrong-key",
      "tampered-backup",
      "existing-backup-not-overwritten",
    ],
    rows,
  };
} finally {
  await restored.end();
}
await writeFile(resolve(output, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
});
console.log(JSON.stringify({ ok: true, evidence: resolve(output, "evidence.json"), ...evidence }));
