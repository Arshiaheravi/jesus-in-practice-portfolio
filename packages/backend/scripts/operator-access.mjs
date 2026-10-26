import { parseArgs } from "node:util";
import pg from "pg";
import { databaseConnectionConfig } from "../src/database-config.ts";

const { values } = parseArgs({
  options: {
    user: { type: "string" },
    role: { type: "string" },
    reason: { type: "string" },
    actor: { type: "string" },
    revoke: { type: "boolean" },
    apply: { type: "boolean" },
  },
});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (
  !uuid.test(values.user ?? "") ||
  !uuid.test(values.actor ?? "") ||
  (!values.revoke && !["admin", "support", "editor"].includes(values.role)) ||
  !values.reason ||
  values.reason.trim().length < 10 ||
  values.reason.length > 500
)
  throw new Error(
    'Required: --user UUID --actor UUID --role admin|support|editor (or --revoke) --reason "specific reason". Use the verified Auth user ID; email does not grant operator access.',
  );
if (!values.apply) {
  console.log(
    "No changes made. Review the target account and role, then add --apply. Use a database-owner connection in a secure environment.",
  );
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in the environment.");
const client = new pg.Client({
  ...databaseConnectionConfig(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT),
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  await client.query("begin");
  await client.query("set local statement_timeout='10s'");
  const target = await client.query(
    "select id from auth.users where id=$1 and email_confirmed_at is not null",
    [values.user],
  );
  const actor = await client.query(
    "select id from auth.users where id=$1 and email_confirmed_at is not null",
    [values.actor],
  );
  if (!target.rowCount || !actor.rowCount) throw new Error("Confirmed Auth users required");
  if (values.revoke)
    await client.query(
      "update app.operator_roles set active=false,updated_at=now() where user_id=$1",
      [values.user],
    );
  else
    await client.query(
      "insert into app.operator_roles(user_id,role) values($1,$2) on conflict(user_id) do update set role=excluded.role,active=true,updated_at=now()",
      [values.user, values.role],
    );
  await client.query(
    "insert into app.operator_audit(actor_id,actor_role,action,target_type,target_id,reason,details) values($1,'database-owner',$2,'operator',$3,$4,$5)",
    [
      values.actor,
      values.revoke ? "access.revoke" : "access.grant",
      values.user,
      values.reason,
      JSON.stringify({ role: values.revoke ? null : values.role, via: "owner-cli" }),
    ],
  );
  await client.query("commit");
  console.log("Operator access change committed and audited. Operator actions still require MFA.");
} catch {
  await client.query("rollback").catch(() => {});
  console.error(
    "Operator access change failed. Credentials and raw database errors are omitted. Verify the database target and confirmed account identifiers.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
