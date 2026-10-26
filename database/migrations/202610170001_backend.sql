-- Apply to an isolated Supabase PostgreSQL database before production review.
-- The app schema is deliberately not part of the public PostgREST API.
begin;
create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

create table app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null check (jsonb_typeof(preferences) = 'object'),
  schedule jsonb not null check (jsonb_typeof(schedule) = 'object'),
  version integer not null default 1 check (version > 0),
  delivery_version integer not null default 1 check (delivery_version > 0),
  delivery_updated_at timestamptz not null default now(),
  deleting boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table app.saved_practices (
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_id text not null check (practice_id ~ '^[a-z0-9-]{1,100}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, practice_id)
);
create table app.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_id text not null check (practice_id ~ '^[a-z0-9-]{1,100}$'),
  local_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, practice_id, local_date)
);
create index completions_history on app.completions (user_id, local_date desc, id desc);
create table app.notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_id text not null check (practice_id ~ '^[a-z0-9-]{1,100}$'),
  body text not null check (char_length(body) <= 1500),
  updated_at timestamptz not null default now(),
  primary key (user_id, practice_id)
);
create table app.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  value text not null check (char_length(value) between 3 and 320),
  destination_hash text not null check (destination_hash ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, channel),
  unique (channel, destination_hash)
);
create table app.phone_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null check (phone ~ '^\+1[0-9]{10}$'),
  challenge_id text not null check (char_length(challenge_id) between 1 and 200),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table app.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  destination_hash text not null check (destination_hash ~ '^[a-f0-9]{64}$'),
  granted boolean not null,
  wording_version text not null check (char_length(wording_version) between 1 and 100),
  reason text not null check (char_length(reason) between 1 and 100),
  created_at timestamptz not null default clock_timestamp(),
  sequence bigint generated always as identity unique
);
create index consent_events_current on app.consent_events (user_id, channel, destination_hash, sequence desc);
-- A keyed destination digest prevents an old STOP from being lost on account deletion.
-- This table contains no cleartext destination and must have an explicit retention policy.
create table app.suppressions (
  channel text not null check (channel in ('email', 'sms')),
  destination_hash text not null check (destination_hash ~ '^[a-f0-9]{64}$'),
  reason text not null check (char_length(reason) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (channel, destination_hash)
);

-- Financial records survive account deletion without the auth/user association.
create table app.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  available_cents integer not null default 0 check (available_cents >= 0),
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  blocked_reason text check (char_length(blocked_reason) <= 100),
  currency text not null default 'cad' check (currency = 'cad'),
  created_at timestamptz not null default now()
);
create table app.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references app.wallets(id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'cad' check (currency = 'cad'),
  provider_session_id text unique,
  payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkout_intents_wallet on app.checkout_intents (wallet_id, created_at desc, id desc);
create table app.financial_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references app.wallets(id),
  provider_event_id text not null unique,
  payment_intent_id text not null,
  kind text not null check (kind in ('refund', 'dispute')),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);
create index financial_events_payment on app.financial_events (payment_intent_id);
create index financial_events_wallet on app.financial_events (wallet_id);
create table app.deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_key text not null check (char_length(occurrence_key) between 1 and 200),
  channel text not null check (channel in ('email', 'sms')),
  practice_id text not null,
  content_version text not null,
  profile_version integer not null,
  contact_id uuid not null references app.contacts(id) on delete cascade,
  contact_version integer not null,
  consent_id uuid not null references app.consent_events(id) on delete cascade,
  destination_hash text not null check (destination_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  scheduled_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','claimed','sending','submitted','delivered','failed','unknown','cancelled')),
  claim_token uuid,
  lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, occurrence_key, channel),
  check (expires_at > scheduled_at)
);
create index deliveries_due on app.deliveries (scheduled_at, id) where status in ('queued', 'claimed');
create index deliveries_user_history on app.deliveries (user_id, created_at desc, id desc);
create index deliveries_contact on app.deliveries (contact_id);
create index deliveries_consent on app.deliveries (consent_id);
create unique index deliveries_provider on app.deliveries (channel, provider_id) where provider_id is not null;
create table app.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references app.deliveries(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  status text not null check (status in ('sending','submitted','delivered','failed','unknown')),
  provider_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, attempt)
);
create table app.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references app.wallets(id),
  -- No FK: settled financial evidence can survive deletion of private delivery records.
  delivery_id uuid not null unique,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'held' check (status in ('held', 'settled', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credit_reservations_wallet on app.credit_reservations (wallet_id);
create table app.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references app.wallets(id),
  kind text not null check (kind in ('fund', 'reserve', 'settle', 'release')),
  amount_cents integer not null check (amount_cents > 0),
  available_delta integer not null,
  reserved_delta integer not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (
    (kind='fund' and available_delta=amount_cents and reserved_delta=0) or
    (kind='reserve' and available_delta=-amount_cents and reserved_delta=amount_cents) or
    (kind='settle' and available_delta=0 and reserved_delta=-amount_cents) or
    (kind='release' and available_delta=amount_cents and reserved_delta=-amount_cents)
  )
);
create index credit_ledger_wallet on app.credit_ledger (wallet_id, created_at desc, id desc);
create function app.reject_ledger_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Financial ledger records are immutable' using errcode='23514'; end;
$$;
revoke all on function app.reject_ledger_mutation() from public, anon, authenticated;
create trigger credit_ledger_immutable before update or delete on app.credit_ledger
  for each row execute function app.reject_ledger_mutation();
create trigger financial_events_immutable before update or delete on app.financial_events
  for each row execute function app.reject_ledger_mutation();

create table app.webhook_receipts (
  provider text not null,
  event_id text not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'received' check (status in ('received', 'processed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);
create table app.rate_limits (
  bucket_key text primary key check (char_length(bucket_key) between 1 and 200),
  window_started_at timestamptz not null,
  count integer not null check (count >= 1)
);
create table app.job_cursors (
  job_name text primary key,
  cursor text,
  updated_at timestamptz not null default now()
);

-- Grants and policies are separate boundaries. Financial/provider writes are never member grants.
grant select, insert, update, delete on app.profiles, app.saved_practices, app.completions, app.notes to authenticated;
grant select on app.contacts, app.consent_events, app.wallets, app.credit_ledger, app.deliveries to authenticated;
grant all on all tables in schema app to service_role;
revoke update, delete, truncate on app.credit_ledger, app.financial_events from service_role;
grant usage, select on all sequences in schema app to service_role;
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','saved_practices','completions','notes'] loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format('create policy owner_access on app.%I to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)', table_name);
  end loop;
  foreach table_name in array array['contacts','consent_events','wallets','deliveries'] loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format('create policy owner_read on app.%I for select to authenticated using ((select auth.uid())=user_id)', table_name);
  end loop;
  foreach table_name in array array['phone_challenges','suppressions','checkout_intents','financial_events','delivery_attempts','credit_reservations','credit_ledger','webhook_receipts','rate_limits','job_cursors'] loop
    execute format('alter table app.%I enable row level security', table_name);
  end loop;
end;
$$;
create policy owner_ledger_read on app.credit_ledger for select to authenticated
using (exists (select 1 from app.wallets w where w.id=wallet_id and w.user_id=(select auth.uid())));
commit;
