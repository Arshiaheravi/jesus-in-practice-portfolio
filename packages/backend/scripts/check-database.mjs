import { createDatabase } from "../src/database.ts";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in a secure environment before checking the database.");
  process.exit(1);
}
const db = createDatabase(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});
try {
  const service = await db.withService(async (sql) => {
    const role = (await sql.query("select current_user as role")).rows[0].role;
    if (role !== "service_role") throw new Error();
    const tables = (
      await sql.query(
        "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relkind='r' and c.relname<>'schema_migrations'",
      )
    ).rows;
    if (tables.length < 18 || tables.some((table) => !table.relrowsecurity)) throw new Error();
    await sql.query(
      "select last_reconcile_attempt_at,next_reconcile_at from app.deliveries limit 0",
    );
    await sql.query("select name from app.worker_leases limit 0");
    await sql.query("select name,sha256 from app.schema_migrations limit 0");
    const history = (
      await sql.query(
        `select relrowsecurity,
          has_table_privilege(current_user,oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as writable
        from pg_class where oid='app.schema_migrations'::regclass`,
      )
    ).rows[0];
    if (!history?.relrowsecurity || history.writable) throw new Error();
    return tables.length;
  });
  await db.withUser("00000000-0000-4000-8000-000000000000", async (sql) => {
    if ((await sql.query("select current_user as role")).rows[0].role !== "authenticated")
      throw new Error();
    if (Number((await sql.query("select count(*) as total from app.profiles")).rows[0].total) !== 0)
      throw new Error();
    if (Number((await sql.query("select count(*) as total from app.wallets")).rows[0].total) !== 0)
      throw new Error();
  });
  console.log(
    JSON.stringify({
      connected: true,
      roleSwitching: true,
      rowSecurityTables: service,
      migrationsPresent: true,
      migrationHistoryReadOnly: true,
      note: "Read-only database smoke check; not provider or concurrency verification.",
    }),
  );
} catch {
  console.error(
    "Database verification failed. Check TLS, role memberships, migrations and RLS using a secure database console. No credentials or row data are logged.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
