-- Oh Sakhi initial schema. Run in a new Supabase project SQL Editor.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Sakhi Member' check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 350),
  interests text[] not null default '{}',
  city text not null default 'Richmond',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 70),
  category text not null check (category in ('Coffee','Wellness','Food','Creative','Social')),
  event_date date not null,
  event_time time not null,
  place text not null check (char_length(place) between 2 and 100),
  capacity integer not null check (capacity between 2 and 30),
  description text not null check (char_length(description) between 15 and 700),
  created_at timestamptz not null default now()
);

create table public.meetup_requests (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  primary key (meetup_id,user_id)
);
create index meetup_requests_user_id_idx on public.meetup_requests (user_id);
create index meetups_event_date_idx on public.meetups (event_date);

-- Trigger creates profile at signup, avoiding a second manual profile insertion.
create or replace function public.create_profile_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'),60),''),'Sakhi Member'));
  return new;
end; $$;
create trigger create_profile_after_signup after insert on auth.users
for each row execute function public.create_profile_on_signup();

create or replace function public.touch_profile_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger touch_profiles before update on public.profiles
for each row execute function public.touch_profile_updated_at();

-- Prevent spoofing or moving a meetup between host accounts.
create or replace function public.keep_meetup_host() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.host_id is distinct from old.host_id then raise exception 'Cannot change meetup host'; end if;
 return new;
end; $$;
create trigger keep_meetup_host before update on public.meetups
for each row execute function public.keep_meetup_host();

-- The requesting user cannot approve themselves; host can approve/decline.
-- Enforced via column-scoped grants and RLS update policies.
alter table public.profiles enable row level security;
alter table public.meetups enable row level security;
alter table public.meetup_requests enable row level security;

revoke all on public.profiles,public.meetups,public.meetup_requests from anon,authenticated;
grant select on public.profiles to authenticated;
grant update (display_name,bio,interests,city) on public.profiles to authenticated;
grant select,insert,update,delete on public.meetups to authenticated;
grant select,insert,delete on public.meetup_requests to authenticated;
grant update (status) on public.meetup_requests to authenticated;

create policy profiles_read on public.profiles for select to authenticated
 using (true);
create policy profiles_update_own on public.profiles for update to authenticated
 using ((select auth.uid())=id) with check ((select auth.uid())=id);

create policy meetups_read on public.meetups for select to authenticated using (true);
create policy meetups_create on public.meetups for insert to authenticated
 with check ((select auth.uid())=host_id);
create policy meetups_update on public.meetups for update to authenticated
 using ((select auth.uid())=host_id) with check ((select auth.uid())=host_id);
create policy meetups_delete on public.meetups for delete to authenticated
 using ((select auth.uid())=host_id);

create policy requests_read on public.meetup_requests for select to authenticated
 using ((select auth.uid())=user_id or exists
   (select 1 from public.meetups m where m.id=meetup_id and m.host_id=(select auth.uid())));
create policy requests_insert on public.meetup_requests for insert to authenticated
 with check ((select auth.uid())=user_id and status='pending'
   and exists (select 1 from public.meetups m where m.id=meetup_id and m.host_id<>(select auth.uid()) and m.event_date>=current_date));
create policy requests_delete on public.meetup_requests for delete to authenticated
 using ((select auth.uid())=user_id);
create policy requests_host_update on public.meetup_requests for update to authenticated
 using (exists (select 1 from public.meetups m where m.id=meetup_id and m.host_id=(select auth.uid())))
 with check (exists (select 1 from public.meetups m where m.id=meetup_id and m.host_id=(select auth.uid())) and status in ('approved','declined'));

-- Capacity enforcement happens in database to avoid simultaneous overbooking.
create or replace function public.enforce_meetup_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare max_seats integer; approved_count integer;
begin
 if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
  select capacity into max_seats from public.meetups where id=new.meetup_id for update;
  select count(*) into approved_count from public.meetup_requests where meetup_id=new.meetup_id and status='approved';
  if approved_count >= max_seats then raise exception 'This meetup is already full'; end if;
 end if;
 return new;
end; $$;
create trigger check_meetup_capacity before insert or update of status on public.meetup_requests
for each row execute function public.enforce_meetup_capacity();

-- Keep meetup ownership and status immutable for non-hosts via grants above and policies.
