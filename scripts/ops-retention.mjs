import { createDatabase } from "../packages/backend/src/database.ts";
import { parseRetentionPolicy, runRetention } from "../packages/backend/src/maintenance.ts";
import { argument, databaseTarget, verifyTarget } from "./ops-common.mjs";

let database;
try {
  const target = databaseTarget(process.env.DATABASE_URL);
  verifyTarget(target, argument("--expect-target"));
  const policy = parseRetentionPolicy(JSON.parse(process.env.RETENTION_POLICY_JSON || "null"));
  database = createDatabase(target.connection.connectionString, {
    max: 1,
    ...(target.connection.ssl ? { ssl: target.connection.ssl } : {}),
  });
  const result = await runRetention(database, policy, {
    dryRun: !process.argv.includes("--apply"),
  });
  console.log(JSON.stringify(result));
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        "Retention failed. Verify the explicit target, approved policy and migrations securely.",
    }),
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
