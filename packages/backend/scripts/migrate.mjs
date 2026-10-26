import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseConnectionConfig } from "../src/database-config.ts";

if (!process.argv.includes("--apply")) {
  console.error(
    "No changes made. Run with --apply against the intended database after reviewing migrations and taking a backup.",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required; use a secret environment file.");
const client = new pg.Client({
  ...databaseConnectionConfig(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT),
  connectionTimeoutMillis: 10000,
});
const folder = new URL("../../../database/migrations/", import.meta.url);
try {
  await client.connect();
  await client.query("select pg_advisory_lock(721044319)");
  await client.query("create schema if not exists app");
  await client.query(
    "create table if not exists app.schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())",
  );
  for (const name of (await readdir(folder)).filter((name) => name.endsWith(".sql")).sort()) {
    const content = await readFile(new URL(name, folder), "utf8");
    const checksum = createHash("sha256").update(content).digest("hex");
    const existing = await client.query("select sha256 from app.schema_migrations where name=$1", [
      name,
    ]);
    if (existing.rows.length) {
      if (existing.rows[0].sha256 !== checksum)
        throw new Error(`Previously applied migration was edited: ${name}`);
      console.log(`Already applied: ${name}`);
      continue;
    }
    await client.query("begin");
    try {
      // Keep the migration and its checksum atomic, including files usable directly in the SQL editor.
      await client.query(content.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, ""));
      await client.query("insert into app.schema_migrations(name,sha256) values($1,$2)", [
        name,
        checksum,
      ]);
      await client.query("commit");
      console.log(`Applied: ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log(`Migration files verified in ${fileURLToPath(folder)}`);
} catch {
  console.error(
    "Migration failed. Database credentials and raw SQL errors are omitted. Inspect the database securely before retrying; completed migrations are recorded with checksums.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
