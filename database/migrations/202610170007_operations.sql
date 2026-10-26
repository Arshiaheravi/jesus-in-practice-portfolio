begin;
-- Retain financial, consent, suppression and provider deduplication evidence.
-- Only terminal delivery payloads are eligible for explicit policy-driven redaction.
alter table app.deliveries add column payload_redacted_at timestamptz;
create index deliveries_retention on app.deliveries(updated_at, id)
  where status in ('delivered','failed','cancelled') and payload_redacted_at is null;
create index phone_challenges_retention on app.phone_challenges(expires_at, user_id);
create index rate_limits_retention on app.rate_limits(window_started_at, bucket_key);
create index webhook_receipts_unprocessed on app.webhook_receipts(received_at)
  where status='received';

create table app.maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'),
  approval_reference text not null check (char_length(approval_reference) between 1 and 200),
  counts jsonb not null check (jsonb_typeof(counts)='object'),
  completed_at timestamptz not null default now()
);
create index maintenance_runs_latest on app.maintenance_runs(completed_at desc);
alter table app.maintenance_runs enable row level security;
revoke all on app.maintenance_runs from public, anon, authenticated;
grant select, insert on app.maintenance_runs to service_role;
commit;
