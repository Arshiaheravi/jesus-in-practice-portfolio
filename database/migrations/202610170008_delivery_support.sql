begin;
alter table app.credit_reservations drop constraint credit_reservations_status_check;
alter table app.credit_reservations add constraint credit_reservations_status_check
  check(status in('held','settled','released','waived'));
alter table app.credit_ledger drop constraint credit_ledger_kind_check;
alter table app.credit_ledger drop constraint credit_ledger_check;
alter table app.credit_ledger add constraint credit_ledger_kind_check check
  (kind in('fund','reserve','settle','release','refund_hold','refund_settle','refund_release','refund_return','incident_debit','incident_restore','waiver'));
alter table app.credit_ledger add constraint credit_ledger_check check (
  (kind in('fund','refund_return','incident_restore') and available_delta=amount_cents and reserved_delta=0) or
  (kind in('reserve','refund_hold') and available_delta=-amount_cents and reserved_delta=amount_cents) or
  (kind in('settle','refund_settle') and available_delta=0 and reserved_delta=-amount_cents) or
  (kind in('release','refund_release','waiver') and available_delta=amount_cents and reserved_delta=-amount_cents) or
  (kind='incident_debit' and available_delta=-amount_cents and reserved_delta=0)
);
create table app.delivery_charge_waivers (
  operation_id uuid primary key,
  wallet_id uuid not null references app.wallets(id),
  reservation_id uuid not null unique references app.credit_reservations(id),
  -- Opaque delivery/actor IDs intentionally outlive deleted private account records.
  delivery_id uuid not null unique,
  actor_id uuid not null,
  amount_cents integer not null check(amount_cents>0),
  reason text not null check(char_length(reason) between 10 and 500),
  provider_id text,
  created_at timestamptz not null default now()
);
create index delivery_charge_waivers_wallet on app.delivery_charge_waivers(wallet_id,created_at desc);
create trigger delivery_charge_waivers_immutable before update or delete on app.delivery_charge_waivers
  for each row execute function app.reject_ledger_mutation();
alter table app.delivery_charge_waivers enable row level security;
revoke all on app.delivery_charge_waivers from public,anon,authenticated;
grant select,insert on app.delivery_charge_waivers to service_role;
commit;
