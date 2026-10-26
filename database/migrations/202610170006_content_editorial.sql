begin;
create table app.content_editions (
  id text primary key check(id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  manifest jsonb not null check(jsonb_typeof(manifest)='object'),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  rights jsonb not null default '{"approved":false,"allowedUses":[],"inventoryVerified":false,"expiresAt":null}'::jsonb,
  imported_at timestamptz, created_by uuid not null, created_at timestamptz not null default now()
);
create table app.content_verses (
  edition_id text not null references app.content_editions(id), book text not null,
  chapter integer not null check(chapter>0), verse integer not null check(verse>0),
  text text not null check(char_length(text) between 1 and 6000),
  primary key(edition_id,book,chapter,verse)
);
create table app.content_versions (
  id uuid primary key, practice_id text not null check(practice_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  revision integer not null check(revision>0), edition_id text not null references app.content_editions(id),
  passage jsonb not null check(jsonb_typeof(passage)='object'), draft jsonb not null check(jsonb_typeof(draft)='object'), provenance jsonb not null check(jsonb_typeof(provenance)='object'),
  created_by uuid not null, created_at timestamptz not null default now(),
  unique(practice_id,revision)
);
create index content_versions_edition on app.content_versions(edition_id,created_at,id);
create table app.content_events (
  sequence bigint generated always as identity primary key,
  edition_id text not null references app.content_editions(id), version_id uuid references app.content_versions(id),
  action text not null check(action in ('rights','imported','draft_created','review_approve','review_reject','published','withdrawn')),
  detail jsonb not null default '{}'::jsonb, actor_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
create index content_events_version on app.content_events(version_id,sequence desc);
create index content_events_edition on app.content_events(edition_id,sequence desc);
create table app.content_publications (
  practice_id text primary key, version_id uuid not null unique references app.content_versions(id),
  published_at timestamptz not null default now(), active boolean not null default true
);
create function app.protect_content_edition() returns trigger language plpgsql set search_path='' as $$
begin
  if new.manifest is distinct from old.manifest or new.manifest_sha256 is distinct from old.manifest_sha256 or new.artifact_sha256 is distinct from old.artifact_sha256 or new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or (old.imported_at is not null and new.imported_at is distinct from old.imported_at) then raise exception 'Edition manifest and completed import are immutable'; end if;
  return new;
end; $$;
create trigger content_edition_immutable before update on app.content_editions for each row execute function app.protect_content_edition();
create function app.reject_content_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Content evidence is immutable'; end; $$;
create trigger content_verses_immutable before update or delete on app.content_verses for each row execute function app.reject_content_mutation();
create trigger content_versions_immutable before update or delete on app.content_versions for each row execute function app.reject_content_mutation();
create trigger content_events_immutable before update or delete on app.content_events for each row execute function app.reject_content_mutation();
revoke all on function app.protect_content_edition(),app.reject_content_mutation() from public,anon,authenticated;
alter table app.content_editions enable row level security;
alter table app.content_verses enable row level security;
alter table app.content_versions enable row level security;
alter table app.content_events enable row level security;
alter table app.content_publications enable row level security;
revoke all on app.content_editions,app.content_verses,app.content_versions,app.content_events,app.content_publications from public,anon,authenticated;
grant select,insert,update on app.content_editions,app.content_publications to service_role;
grant select,insert on app.content_verses,app.content_versions,app.content_events to service_role;
grant usage,select on sequence app.content_events_sequence_seq to service_role;
-- A member transaction may validate an opaque practice ID without reading private editorial evidence.
create function app.content_practice_available(p_practice_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.content_publications p join app.content_versions v on v.id=p.version_id join app.content_editions e on e.id=v.edition_id
 where p.practice_id=p_practice_id and p.active and e.imported_at is not null
 and e.rights->>'approved'='true' and e.rights->>'inventoryVerified'='true'
 and (e.rights->'territories' ? 'CA' or e.rights->'territories' ? 'WORLDWIDE')
 and e.rights->'allowedUses' ? 'display'
 and (e.rights->>'expiresAt' is null or (e.rights->>'expiresAt')::timestamptz>now())
 and not exists(select 1 from app.content_events ce where ce.version_id=v.id and ce.action='withdrawn')
 and (select ce.action from app.content_events ce where ce.version_id=v.id and ce.action in('review_approve','review_reject') order by ce.sequence desc limit 1)='review_approve');
$$;
revoke all on function app.content_practice_available(text) from public,anon;
grant execute on function app.content_practice_available(text) to authenticated,service_role;
create function app.content_version_available(p_version_id uuid,p_channel text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app.content_publications p join app.content_versions v on v.id=p.version_id join app.content_editions e on e.id=v.edition_id
 where p.version_id=p_version_id and p.active and p_channel in('display','email','sms')
 and app.content_practice_available(p.practice_id) and e.rights->'allowedUses' ? p_channel);
$$;
revoke all on function app.content_version_available(uuid,text) from public,anon,authenticated;
grant execute on function app.content_version_available(uuid,text) to service_role;
commit;
