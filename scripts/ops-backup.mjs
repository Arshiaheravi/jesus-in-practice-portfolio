import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  OperationsError,
  argument,
  databaseTarget,
  launchUtility,
  loadPg,
  verifyTarget,
} from "./ops-common.mjs";

let output;
let owned = false;
try {
  const target = databaseTarget(process.env.DATABASE_URL);
  verifyTarget(target, argument("--expect-target"));
  const destination = argument("--output");
  if (!destination) throw new OperationsError("Supply a new --output encrypted backup filename.");
  output = resolve(destination);
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32)
    throw new OperationsError("BACKUP_ENCRYPTION_KEY must encode 32 random bytes in base64.");
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const handle = await open(output, "wx", 0o600);
  owned = true;
  const header = Buffer.concat([Buffer.from("JIPBK01"), randomBytes(12)]);
  await handle.write(header);
  await handle.close();
  const client = new (loadPg().Client)(target.connection);
  let identity;
  try {
    await client.connect();
    identity = (
      await client.query(
        "select current_database() as database,current_setting('server_version') as version",
      )
    ).rows[0];
  } finally {
    await client.end();
  }
  const cipher = createCipheriv("aes-256-gcm", key, header.subarray(7));
  cipher.setAAD(header);
  const { child, done } = launchUtility(
    "pg_dump",
    ["--format=custom", "--no-password", "--lock-wait-timeout=10000"],
    target.utilityEnv,
  );
  child.stdin.end();
  try {
    await Promise.all([
      pipeline(child.stdout, cipher, createWriteStream(output, { flags: "a", mode: 0o600 })),
      done,
    ]);
  } catch (error) {
    child.kill();
    throw error;
  }
  await appendFile(output, cipher.getAuthTag());
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(output)) digest.update(chunk);
  const manifest = {
    format: "jip-pgdump-aes-256-gcm-v1",
    createdAt: new Date().toISOString(),
    source: target.identity,
    serverVersion: identity.version,
    sha256: digest.digest("hex"),
    rolesIncluded: false,
    providerProjectConfigurationIncluded: false,
    revision: process.env.RELEASE_REVISION || null,
  };
  await writeFile(`${output}.json`, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      ok: true,
      backup: output,
      manifest: `${output}.json`,
      restorationVerified: false,
    }),
  );
} catch (error) {
  if (owned && output) await rm(output, { force: true });
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof OperationsError ? error.message : "Backup failed.",
    }),
  );
  process.exitCode = 1;
}
