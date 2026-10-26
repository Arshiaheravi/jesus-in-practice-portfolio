begin;
create table app.worker_leases (
  name text primary key,
  token uuid not null,
  expires_at timestamptz not null
);
alter table app.worker_leases enable row level security;
revoke all on app.worker_leases from public, anon, authenticated;
grant all on app.worker_leases to service_role;
commit;
