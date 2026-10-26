import { createDecipheriv, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, readFile, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  OperationsError,
  argument,
  databaseTarget,
  launchUtility,
  loadPg,
  verifyTarget,
} from "./ops-common.mjs";

let temporary;
try {
  if (!process.argv.includes("--apply") || !process.argv.includes("--confirm-empty"))
    throw new OperationsError(
      "Restore requires --apply --confirm-empty and an isolated, empty target. No changes made.",
    );
  const target = databaseTarget(process.env.RESTORE_DATABASE_URL);
  verifyTarget(target, argument("--expect-target"));
  if (!target.local && process.env.ALLOW_REMOTE_RESTORE !== "true")
    throw new OperationsError(
      "Remote restore is disabled; an authorized recovery requires ALLOW_REMOTE_RESTORE=true.",
    );
  if (
    process.env.DATABASE_URL &&
    target.identity === databaseTarget(process.env.DATABASE_URL).identity
  )
    throw new OperationsError("Restore target must differ from the configured source database.");
  const input = argument("--input");
  if (!input) throw new OperationsError("Supply --input to a trusted encrypted backup.");
  const file = resolve(input);
  const manifest = JSON.parse(await readFile(`${file}.json`, "utf8"));
  if (manifest.format !== "jip-pgdump-aes-256-gcm-v1" || manifest.source === target.identity)
    throw new OperationsError("Invalid format or source/restore target collision.");
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  if (digest.digest("hex") !== manifest.sha256)
    throw new OperationsError("Backup checksum mismatch.");
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new OperationsError("A matching backup encryption key is required.");
  const size = (await stat(file)).size;
  if (size < 36) throw new OperationsError("Truncated backup.");
  const handle = await open(file, "r");
  const header = Buffer.alloc(19);
  const tag = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 19, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (header.subarray(0, 7).toString() !== "JIPBK01")
    throw new OperationsError("Invalid encrypted backup header.");
  temporary = await mkdtemp(join(tmpdir(), "jip-restore-"));
  const clear = join(temporary, "verified.dump");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(7));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  // Verify the complete authentication tag BEFORE allowing pg_restore to execute any bytes.
  await pipeline(
    createReadStream(file, { start: 19, end: size - 17 }),
    decipher,
    createWriteStream(clear, { flags: "wx", mode: 0o600 }),
  );
  const client = new (loadPg().Client)(target.connection);
  try {
    await client.connect();
    const occupied = await client.query(
      "select count(*) as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in ('r','p','v','m','S')",
    );
    if (Number(occupied.rows[0].count) !== 0)
      throw new OperationsError(
        "Restore refuses a non-empty database; no overwrite/clean mode is implemented.",
      );
    // Operators must keep this isolated target unavailable to concurrent applications.
    const { child, done } = launchUtility(
      "pg_restore",
      [
        "--no-owner",
        "--no-password",
        "--exit-on-error",
        "--single-transaction",
        `--dbname=${target.utilityEnv.PGDATABASE}`,
        clear,
      ],
      target.utilityEnv,
    );
    child.stdin.end();
    child.stdout.resume();
    await done;
    const restored = await client.query(
      "select to_regclass('app.schema_migrations') is not null as migrations,to_regclass('auth.users') is not null as identity",
    );
    if (!restored.rows[0].migrations || !restored.rows[0].identity)
      throw new OperationsError("Restore completed but required schema verification failed.");
  } finally {
    await client.end();
  }
  console.log(
    JSON.stringify({
      ok: true,
      restoreTarget: target.identity,
      backupSha256: manifest.sha256,
      note: "Schema restored. Run RLS, ledger, application and provider reconciliation checks before promotion.",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof OperationsError ? error.message : "Restore failed.",
    }),
  );
  process.exitCode = 1;
} finally {
  if (temporary) {
    await rm(join(temporary, "verified.dump"), { force: true });
    await rmdir(temporary).catch(() => {});
  }
}
