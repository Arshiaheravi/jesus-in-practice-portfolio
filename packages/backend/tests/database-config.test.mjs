import assert from "node:assert/strict";
import test from "node:test";
import { databaseConnectionConfig } from "../src/database-config.ts";

test("database configuration enforces remote certificate verification and explicit local settings", () => {
  const config = databaseConnectionConfig(
    "postgresql://fixture:synthetic@db.invalid:5432/fixture?sslmode=require&application_name=jip",
    "synthetic\\ncertificate",
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: "synthetic\ncertificate" });
  assert.equal(new URL(config.connectionString).searchParams.get("application_name"), "jip");
  assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false);
  assert.equal(databaseConnectionConfig("postgresql://fixture@127.0.0.1:55439/fixture").ssl, false);
});
test("database configuration rejects ambiguous targets without revealing credentials", () => {
  const base = "postgresql://fixture:synthetic-private-password@db.invalid/fixture";
  for (const value of [
    `${base}?host=other.invalid`,
    `${base}?port=5433`,
    `${base}?user=other`,
    `${base}?ssl=0`,
    `${base}#fragment`,
    "postgresql://db.invalid/fixture",
    "postgresql://fixture@db.invalid/",
    "not-a-url",
  ]) {
    assert.throws(
      () => databaseConnectionConfig(value),
      (error) => {
        assert.equal(error.message.includes("synthetic-private-password"), false);
        return /Database configuration is invalid/.test(error.message);
      },
    );
  }
});
