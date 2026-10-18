-- Current profile photos are public by default. Other profile data stays private.
-- Buckets stay private so abandoned uploads and replaced photos are not made public.
begin;

create index profiles_current_avatar_idx on public.profiles (avatar_path)
  where avatar_path is not null;

create function private.public_avatar_path(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.avatar_path from public.profiles p
  join private.member_access a on a.user_id=p.id and a.status='active'
  where p.id=p_user_id;
$$;
create function private.is_public_avatar(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p
    join private.member_access a on a.user_id=p.id and a.status='active'
    where p.avatar_path=p_name);
$$;
create or replace function private.avatar_read_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_public_avatar(p_name) or
    (private.is_active_member() and (private.can_write_avatar(p_name) or private.is_admin()));
$$;
revoke all on function private.public_avatar_path(uuid), private.is_public_avatar(text) from public,anon,authenticated;
grant execute on function private.public_avatar_path(uuid), private.is_public_avatar(text) to anon,authenticated;

create policy her_hour_public_current_avatar_read on storage.objects for select to anon,authenticated
  using (bucket_id='profile-photos' and private.is_public_avatar(name));

-- Append only; CREATE OR REPLACE retains the existing directory grants/columns.
create or replace view public.meetup_directory with (security_invoker = true) as
select m.id,m.host_id,m.title,m.category,m.event_date,m.event_time,m.place,m.capacity,
  m.description,m.created_at,m.status,m.timezone,m.starts_at,m.ends_at,m.registration_deadline,
  m.cover_path,m.host_label,m.approved_count,m.updated_at,m.host_label as host_name,m.details_updated_at,
  private.public_avatar_path(m.host_id) as host_avatar_path
from public.meetups m;

-- Resolve only current photo paths for known member IDs; never return private profiles.
create function public.get_public_avatars(p_user_ids uuid[])
returns table(user_id uuid,avatar_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user_ids is null or cardinality(p_user_ids)>100 then
    raise exception 'Request up to 100 member photos at a time' using errcode='22023';
  end if;
  return query select p.id,p.avatar_path from public.profiles p
    join private.member_access a on a.user_id=p.id and a.status='active'
    where p.id=any(p_user_ids) and p.avatar_path is not null;
end;
$$;
revoke all on function public.get_public_avatars(uuid[]) from public,anon,authenticated;
grant execute on function public.get_public_avatars(uuid[]) to anon,authenticated;

notify pgrst,'reload schema';
commit;
