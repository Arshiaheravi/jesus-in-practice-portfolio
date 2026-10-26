import assert from "node:assert/strict";
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  parseFixtureConnection,
  readFixtureConnection,
} from "../../../scripts/test-postgres-fixture.mjs";

const fixture = {
  host: "127.0.0.1",
  port: 55439,
  user: "jip_test_admin",
  password: "synthetic-ci-only-password",
  database: "jip_fixture",
};

test("fixture parser returns only explicit loopback settings and bounded timeouts", () => {
  const result = parseFixtureConnection(fixture);
  assert.deepEqual(result, {
    ...fixture,
    ssl: false,
    options: "-c statement_timeout=30000 -c lock_timeout=5000",
    connectionTimeoutMillis: 5000,
    query_timeout: 35000,
  });
  assert.notEqual(result, fixture);
  assert.equal(Object.hasOwn(fixture, "options"), false);
});

test("fixture parser rejects driver overrides before a database client can be created", () => {
  for (const key of ["connectionString", "ssl", "options", "stream", "lookup", "hostaddr"])
    assert.throws(
      () => parseFixtureConnection({ ...fixture, [key]: "unsupported-fixture-option" }),
      /Unsupported fixture connection options/,
    );
});

test("fixture parser rejects missing or non-fixture identity without echoing supplied values", () => {
  for (const settings of [
    null,
    [],
    "invalid-settings",
    { ...fixture, host: "example.test" },
    { ...fixture, port: 5432 },
    { ...fixture, user: "other-user" },
    { ...fixture, database: "not a database identifier" },
    { ...fixture, database: "x".repeat(64) },
    { ...fixture, password: undefined },
    { ...fixture, password: "" },
  ])
    assert.throws(
      () => parseFixtureConnection(settings),
      (error) => {
        assert.ok(!error.message.includes(fixture.password));
        assert.ok(!error.message.includes("example.test"));
        return true;
      },
    );
});

test("fixture files are bounded and parsed without opening a database connection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jip-fixture-parser-"));
  const file = join(directory, "connection.json");
  try {
    await writeFile(file, JSON.stringify(fixture));
    assert.equal((await readFixtureConnection(file)).database, fixture.database);
    await writeFile(file, " ".repeat(4097));
    await assert.rejects(readFixtureConnection(file), /exceeds its limit/);
    await writeFile(file, '{"password":"synthetic-sensitive-fragment"');
    await assert.rejects(readFixtureConnection(file), (error) => {
      assert.equal(error.message, "Fixture connection file must contain valid UTF-8 JSON.");
      return true;
    });
    await writeFile(file, Buffer.from([0xff, 0xfe]));
    await assert.rejects(readFixtureConnection(file), /valid UTF-8 JSON/);
    await writeFile(file, JSON.stringify({ ...fixture, connectionString: "unsupported" }));
    await assert.rejects(readFixtureConnection(file), /Unsupported fixture connection options/);
  } finally {
    await rm(file, { force: true });
    await rmdir(directory);
  }
});
