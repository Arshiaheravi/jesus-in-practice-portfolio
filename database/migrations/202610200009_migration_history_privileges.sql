begin;
-- The migration runner creates this first; keep direct SQL-editor installs compatible.
create table if not exists app.schema_migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);
alter table app.schema_migrations enable row level security;
-- Runtime readiness may inspect checksums but must never rewrite migration evidence.
revoke all on app.schema_migrations from public, anon, authenticated, service_role;
grant select on app.schema_migrations to service_role;
commit;
