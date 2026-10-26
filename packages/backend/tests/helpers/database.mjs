import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Database } from "../../src/database.ts";
import { BackendRepository } from "../../src/repository.ts";

/** Real embedded PostgreSQL SQL/RLS, with simulated Auth. One session only: no cross-session race proof. */
export async function createTestDatabase() {
  const sql = new PGlite();
  await sql.exec(`create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
  const migrations = new URL("../../../../database/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await sql.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  let queue = Promise.resolve();
  const db = new Database({
    async connect() {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      return { query: (statement, values) => sql.query(statement, values), release };
    },
    async end() {
      await queue;
      await sql.close();
    },
  });
  const repo = new BackendRepository(db);
  const createMember = async () => {
    const userId = randomUUID();
    await sql.query("insert into auth.users(id,email) values($1,$2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await repo.ensureProfile(userId);
    return userId;
  };
  const userA = await createMember();
  const userB = await createMember();
  return { db, repo, sql, pglite: sql, userA, userB, createMember, close: () => db.close() };
}
