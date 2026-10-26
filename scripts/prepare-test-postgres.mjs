/** Prepare only the disposable loopback service in deployment/compose.test.yaml. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadPg } from "./ops-common.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  throw new Error("Use --run only with the disposable PostgreSQL test service.");
}

// Deliberately does not accept DATABASE_URL, provider credentials or a remote host.
const fixture = {
  host: "127.0.0.1",
  port: 55439,
  user: "jip_test_admin",
  password: "synthetic-ci-only-password",
  database: "jip_fixture",
};
const database = new (loadPg().Client)({
  ...fixture,
  ssl: false,
  options: "-c statement_timeout=30000 -c lock_timeout=5000",
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});
try {
  await database.connect();
  const identity = await database.query(
    "select current_database() as database, current_user as user",
  );
  if (identity.rows[0].database !== fixture.database || identity.rows[0].user !== fixture.user) {
    throw new Error("Expected the disposable fixture database and administrator.");
  }
  const occupied = await database.query(
    "select 1 from pg_namespace where nspname not like 'pg_%' and nspname not in ('public','information_schema') union all select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') limit 1",
  );
  if (occupied.rowCount) throw new Error("Fixture bootstrap database must be empty.");
  const roles = await database.query(
    "select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = any($1::text[])",
    [["anon", "authenticated", "service_role"]],
  );
  for (const role of roles.rows) {
    if (
      role.rolcanlogin ||
      role.rolsuper ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.rolbypassrls !== (role.rolname === "service_role")
    ) {
      throw new Error("Existing role does not match an isolated synthetic fixture role.");
    }
  }
  const statements = {
    anon: "create role anon nologin",
    authenticated: "create role authenticated nologin",
    service_role: "create role service_role nologin bypassrls",
  };
  for (const [name, statement] of Object.entries(statements)) {
    if (!roles.rows.some((role) => role.rolname === name)) await database.query(statement);
  }
} finally {
  await database.end();
}

const folder = new URL("../.local/test-postgres/", import.meta.url);
await mkdir(folder, { recursive: true, mode: 0o700 });
await writeFile(new URL("connection.json", folder), `${JSON.stringify(fixture, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    prepared: true,
    synthetic: true,
    providerServicesVerified: false,
    connectionFile: fileURLToPath(new URL("connection.json", folder)),
  }),
);
