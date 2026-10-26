-- Operator authority is database-managed; user metadata/email never grants access.
begin;
create table app.operator_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','support','editor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table app.operator_audit (
  id uuid primary key default gen_random_uuid(),
  -- Preserve an opaque actor identifier; account erasure must not rewrite audit evidence.
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('admin','support','editor','database-owner')),
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id text not null check (char_length(target_id) between 1 and 200),
  reason text not null check (char_length(reason) between 10 and 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);
create index operator_audit_recent on app.operator_audit(created_at desc,id desc);
create index operator_audit_actor on app.operator_audit(actor_id,created_at desc);
alter table app.operator_roles enable row level security;
alter table app.operator_audit enable row level security;
revoke all on app.operator_roles,app.operator_audit from public,anon,authenticated;
grant select on app.operator_roles to service_role;
grant select,insert on app.operator_audit to service_role;
create trigger operator_audit_immutable before update or delete on app.operator_audit
  for each row execute function app.reject_ledger_mutation();
commit;
