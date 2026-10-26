begin;
alter table app.deliveries add column last_reconcile_attempt_at timestamptz;
alter table app.deliveries add column next_reconcile_at timestamptz;
create index deliveries_reconcile on app.deliveries (next_reconcile_at nulls first, created_at, id)
where channel='sms' and status in ('submitted','unknown') and provider_id is not null;
commit;
