begin;

-- Refunds hold only unused credit. Financial rows deliberately retain no auth FK.
create table app.refund_operations (
  id uuid primary key,
  wallet_id uuid not null references app.wallets(id),
  checkout_id uuid not null references app.checkout_intents(id),
  payment_intent_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  actor_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 500),
  status text not null default 'requested' check (status in ('requested','submitting','unknown','pending','requires_action','succeeded','failed','canceled')),
  hold_state text not null default 'held' check (hold_state in ('held','settled','released')),
  provider_refund_id text unique,
  attempted_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  next_reconcile_at timestamptz not null default now(),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refund_operations_wallet on app.refund_operations(wallet_id,created_at desc,id desc);
create index refund_operations_checkout on app.refund_operations(checkout_id);
create index refund_operations_pending on app.refund_operations(next_reconcile_at,id)
  where status in ('requested','submitting','unknown','pending','requires_action');
create function app.protect_refund_identity() returns trigger language plpgsql as $$
begin
  if (new.id,new.wallet_id,new.checkout_id,new.payment_intent_id,new.amount_cents,new.actor_id,new.reason,new.created_at)
    is distinct from (old.id,old.wallet_id,old.checkout_id,old.payment_intent_id,old.amount_cents,old.actor_id,old.reason,old.created_at) then
    raise exception 'Refund request identity is immutable';
  end if;
  return new;
end; $$;
create trigger refund_identity_immutable before update on app.refund_operations
  for each row execute function app.protect_refund_identity();

alter table app.credit_ledger drop constraint credit_ledger_kind_check;
alter table app.credit_ledger drop constraint credit_ledger_check;
alter table app.credit_ledger add constraint credit_ledger_kind_check check
  (kind in ('fund','reserve','settle','release','refund_hold','refund_settle','refund_release','refund_return','incident_debit','incident_restore'));
alter table app.credit_ledger add constraint credit_ledger_check check (
  (kind in ('fund','refund_return','incident_restore') and available_delta=amount_cents and reserved_delta=0) or
  (kind in ('reserve','refund_hold') and available_delta=-amount_cents and reserved_delta=amount_cents) or
  (kind in ('settle','refund_settle') and available_delta=0 and reserved_delta=-amount_cents) or
  (kind in ('release','refund_release') and available_delta=amount_cents and reserved_delta=-amount_cents) or
  (kind='incident_debit' and available_delta=-amount_cents and reserved_delta=0)
);

create table app.payment_reconciliations (
  payment_intent_id text primary key,
  wallet_id uuid not null references app.wallets(id),
  external_debit_cents integer not null default 0 check (external_debit_cents >= 0),
  debt_cents integer not null default 0 check (debt_cents >= 0),
  updated_at timestamptz not null default now()
);
create index payment_reconciliations_wallet on app.payment_reconciliations(wallet_id);
create table app.financial_resolutions (
  operation_id uuid primary key,
  actor_id uuid not null,
  payment_intent_id text not null,
  reason text not null check (char_length(reason) between 10 and 500),
  adjustment_cents integer not null,
  debt_cents integer not null check (debt_cents >= 0),
  result text not null check (result in ('pending','resolved')),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now()
);
create index financial_resolutions_payment on app.financial_resolutions(payment_intent_id,created_at desc);
create table app.financial_event_resolutions (
  event_id uuid primary key references app.financial_events(id),
  operation_id uuid not null references app.financial_resolutions(operation_id),
  created_at timestamptz not null default now()
);
create index financial_event_resolutions_operation on app.financial_event_resolutions(operation_id);
create trigger financial_resolutions_immutable before update or delete on app.financial_resolutions
  for each row execute function app.reject_ledger_mutation();
create trigger financial_event_resolutions_immutable before update or delete on app.financial_event_resolutions
  for each row execute function app.reject_ledger_mutation();

alter table app.checkout_intents add column reconcile_cursor text;
alter table app.checkout_intents add column reconcile_matches text[] not null default '{}';
alter table app.checkout_intents add column next_reconcile_at timestamptz not null default now();
alter table app.checkout_intents add column reconcile_lease_until timestamptz;
alter table app.checkout_intents add column reconcile_error text;
create index checkout_reconciliation_due on app.checkout_intents(next_reconcile_at,id) where status='pending';

alter table app.refund_operations enable row level security;
alter table app.payment_reconciliations enable row level security;
alter table app.financial_resolutions enable row level security;
alter table app.financial_event_resolutions enable row level security;
revoke all on app.refund_operations,app.payment_reconciliations,app.financial_resolutions,app.financial_event_resolutions from public,anon,authenticated;
grant select,insert,update on app.refund_operations,app.payment_reconciliations to service_role;
grant select,insert on app.financial_resolutions,app.financial_event_resolutions to service_role;
commit;
