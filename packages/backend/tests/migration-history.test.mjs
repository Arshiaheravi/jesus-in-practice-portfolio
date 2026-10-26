import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { createTestDatabase } from "./helpers/database.mjs";

let fixture;
const migrationName = "synthetic-recorded-migration.sql";
const checksum = "a".repeat(64);

before(async () => {
  fixture = await createTestDatabase();
  await fixture.sql.query("insert into app.schema_migrations(name,sha256) values($1,$2)", [
    migrationName,
    checksum,
  ]);
});
after(async () => {
  await fixture?.close();
});

test("corrective migration removes existing broad runtime grants without rewriting history", async () => {
  await fixture.sql.query("grant all on app.schema_migrations to service_role");
  assert.equal(
    (
      await fixture.sql.query(
        "select has_table_privilege('service_role','app.schema_migrations','UPDATE') as allowed",
      )
    ).rows[0].allowed,
    true,
  );
  const migration = await readFile(
    new URL(
      "../../../database/migrations/202610200009_migration_history_privileges.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await fixture.sql.exec(migration);
  assert.deepEqual(
    (await fixture.sql.query("select name,sha256 from app.schema_migrations")).rows,
    [{ name: migrationName, sha256: checksum }],
  );
});

test("runtime can read migration evidence without changing it", async () => {
  const read = () =>
    fixture.db.withService((sql) =>
      sql.query("select name,sha256 from app.schema_migrations order by name"),
    );
  assert.deepEqual((await read()).rows, [{ name: migrationName, sha256: checksum }]);
  for (const statement of [
    "insert into app.schema_migrations(name,sha256) values('runtime.sql','unauthorized')",
    "update app.schema_migrations set sha256='unauthorized'",
    "delete from app.schema_migrations",
    "truncate app.schema_migrations",
  ]) {
    await assert.rejects(
      fixture.db.withService((sql) => sql.query(statement)),
      (error) => error.code === "42501",
    );
  }
  assert.deepEqual((await read()).rows, [{ name: migrationName, sha256: checksum }]);
});

test("members and anonymous callers cannot read migration evidence", async () => {
  await assert.rejects(
    fixture.db.withUser(fixture.userA, (sql) => sql.query("select * from app.schema_migrations")),
    (error) => error.code === "42501",
  );
  await fixture.sql.query("begin");
  try {
    await fixture.sql.query("set local role anon");
    await assert.rejects(
      fixture.sql.query("select * from app.schema_migrations"),
      (error) => error.code === "42501",
    );
  } finally {
    await fixture.sql.query("rollback");
  }
});

test("migration owner retains write access and row security is enabled", async () => {
  await fixture.sql.query("insert into app.schema_migrations(name,sha256) values($1,$2)", [
    "synthetic-next-migration.sql",
    "b".repeat(64),
  ]);
  const { rows } = await fixture.sql.query(
    "select relrowsecurity from pg_class where oid='app.schema_migrations'::regclass",
  );
  assert.equal(rows[0].relrowsecurity, true);
  assert.equal(
    Number((await fixture.sql.query("select count(*) from app.schema_migrations")).rows[0].count),
    2,
  );
});
