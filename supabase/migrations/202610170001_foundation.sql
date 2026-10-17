-- Stage A. Apply AFTER both original migrations. No existing rows are deleted.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;
revoke create on schema public from public, anon, authenticated;

create table private.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
create table private.member_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  reason text not null default '' check (char_length(reason) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into private.member_access (user_id) select id from public.profiles;

create table private.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table private.admin_roles enable row level security;
alter table private.member_access enable row level security;
alter table private.admin_audit_log enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;

create function private.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.member_access a
    where a.user_id = (select auth.uid()) and a.status = 'active');
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists
    (select 1 from private.admin_roles r where r.user_id = (select auth.uid()));
$$;
create function private.require_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_member() then
    raise exception 'An active member account is required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
create function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
grant execute on function private.is_active_member(), private.is_admin() to authenticated;

-- Signup creates ordinary access only. User-supplied role/status metadata is ignored.
create function private.create_member_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.member_access (user_id) values (new.id);
  return new;
end;
$$;
create trigger create_member_access after insert on public.profiles
for each row execute function private.create_member_access();

alter table public.profiles
  add column avatar_path text,
  add column neighborhood text not null default '' check (char_length(neighborhood) <= 80),
  add constraint profile_avatar_owned_path check
    (avatar_path is null or avatar_path ~ ('^' || id::text || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$'));

create table public.interests (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (char_length(name) between 1 and 240)
);
create unique index interests_name_key on public.interests (lower(name));
insert into public.interests (id, name) values
  ('coffee', 'Coffee'), ('brunch', 'Brunch'), ('fitness', 'Fitness'),
  ('hiking', 'Hiking'), ('books', 'Books'), ('art', 'Art'), ('fashion', 'Fashion'),
  ('cultural-experiences', 'Cultural experiences'), ('wellness', 'Wellness'),
  ('networking', 'Networking'), ('seasonal-activities', 'Seasonal activities');
-- Preserve legacy interests, including custom names; don't silently discard them.
insert into public.interests (id, name)
select distinct on (lower(btrim(value))) 'legacy-' || md5(lower(btrim(value))), btrim(value)
from public.profiles p cross join lateral unnest(p.interests) value
where btrim(value) <> '' and char_length(btrim(value)) <= 240
order by lower(btrim(value))
on conflict do nothing;
create table public.member_interests (
  member_id uuid not null references public.profiles(id) on delete cascade,
  interest_id text not null references public.interests(id),
  primary key (member_id, interest_id)
);
create index member_interests_interest_idx on public.member_interests (interest_id);
insert into public.member_interests (member_id, interest_id)
select distinct p.id, i.id from public.profiles p
cross join lateral unnest(p.interests) value
join public.interests i on lower(i.name) = lower(btrim(value));

create function private.sync_profile_interests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if cardinality(new.interests) > 12 or exists (
    select 1 from unnest(new.interests) v where not exists
      (select 1 from public.interests i where lower(i.name) = lower(btrim(v)))
  ) then raise exception 'Choose up to 12 supported interests' using errcode = '22023'; end if;
  delete from public.member_interests where member_id = new.id;
  insert into public.member_interests (member_id, interest_id)
    select distinct new.id, i.id from unnest(new.interests) v
      join public.interests i on lower(i.name) = lower(btrim(v));
  return new;
end;
$$;
create trigger sync_profile_interests after insert or update of interests on public.profiles
for each row execute function private.sync_profile_interests();

alter table public.meetups
  add column status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  add column timezone text not null default 'America/New_York',
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column registration_deadline timestamptz,
  add column cover_path text,
  add column host_label text not null default 'Her Hour host' check (char_length(host_label) between 1 and 60),
  add column approved_count integer not null default 0,
  add column updated_at timestamptz not null default now();
update public.meetups set starts_at = (event_date + event_time) at time zone 'America/New_York';
update public.meetups set registration_deadline = starts_at,
  approved_count = (select count(*) from public.meetup_requests r where r.meetup_id = meetups.id and r.status = 'approved');
-- If legacy data is already over capacity, stop atomically instead of losing registrations.
do $$ begin
  if exists (select 1 from public.meetups where approved_count > capacity) then
    raise exception 'Existing meetup exceeds capacity. Review its approved registrations before applying Stage A.';
  end if;
end $$;
alter table public.meetups
  alter column starts_at set not null,
  alter column registration_deadline set not null,
  add constraint meetup_valid_window check (ends_at is null or ends_at > starts_at),
  add constraint meetup_valid_deadline check (registration_deadline <= starts_at),
  add constraint meetup_capacity_count check (approved_count between 0 and capacity),
  add constraint meetup_cover_owned_path check
    (cover_path is null or cover_path ~ ('^' || id::text || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$'));
create index meetups_status_start_idx on public.meetups (status, starts_at);
create index meetups_host_idx on public.meetups (host_id);

alter table public.meetup_requests drop constraint meetup_requests_status_check;
alter table public.meetup_requests
  add constraint meetup_requests_status_check check (status in ('pending','approved','declined','cancelled')),
  add column updated_at timestamptz not null default now(),
  add column decided_at timestamptz,
  add column decided_by uuid references public.profiles(id) on delete set null,
  add column cancelled_at timestamptz;
create index meetup_requests_status_idx on public.meetup_requests (meetup_id, status);
create table public.registration_history (
  id bigint generated always as identity primary key,
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  previous_status text,
  status text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index registration_history_member_idx on public.registration_history (user_id, created_at);
insert into public.registration_history (meetup_id, user_id, status, created_at)
select meetup_id, user_id, status, created_at from public.meetup_requests;

alter table public.reports
  add column status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column resolution_note text not null default '' check (char_length(resolution_note) <= 1000);
create index reports_status_created_idx on public.reports (status, created_at);

-- One atomic per-member counter per operation/window, shared by RPCs and triggers.
create table private.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (user_id, operation)
);
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;
grant all on private.rate_limits to service_role;
create function private.consume_limit(p_operation text, p_limit integer, p_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  insert into private.rate_limits (user_id, operation, window_start, hits)
  values (private.require_member(), p_operation, clock_timestamp(), 1)
  on conflict (user_id, operation) do update set
    hits = case when private.rate_limits.window_start < clock_timestamp() - make_interval(secs => p_seconds)
      then 1 else private.rate_limits.hits + 1 end,
    window_start = case when private.rate_limits.window_start < clock_timestamp() - make_interval(secs => p_seconds)
      then clock_timestamp() else private.rate_limits.window_start end
  returning hits into used;
  if used > p_limit then raise exception 'Too many requests. Please try again later' using errcode = 'P0001'; end if;
end;
$$;
commit;
