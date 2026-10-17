-- Stage E. Explicit self-deletion through the authenticated server endpoint only.
-- Applying this migration does not delete any accounts or alter existing access.
begin;
create table private.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table private.account_deletions enable row level security;
revoke all on private.account_deletions from public,anon,authenticated;
grant all on private.account_deletions to service_role;

create function public.consume_account_deletion_attempt(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor) then raise exception 'Account not found' using errcode='42501'; end if;
  insert into private.rate_limits(user_id,operation,window_start,hits) values(p_actor,'account_deletion',clock_timestamp(),1)
  on conflict(user_id,operation) do update set
    hits=case when private.rate_limits.window_start<clock_timestamp()-interval '15 minutes' then 1 else private.rate_limits.hits+1 end,
    window_start=case when private.rate_limits.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else private.rate_limits.window_start end
  returning hits into used;
  if used>5 then raise exception 'Too many deletion attempts. Please wait 15 minutes and try again'; end if;
end;
$$;

create function public.get_account_deletion_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor) then
    raise exception 'Sign in to manage your account' using errcode='42501';
  end if;
  return jsonb_build_object(
    'hosted_events',(select count(*) from public.meetups where host_id=actor),
    'upcoming_events',(select count(*) from public.meetups where host_id=actor and status='published' and starts_at>now()),
    'rsvps',(select count(*) from public.meetup_requests where user_id=actor),
    'is_admin',exists(select 1 from private.admin_roles where user_id=actor),
    'deleting',exists(select 1 from private.account_deletions where user_id=actor));
end;
$$;

create function public.prepare_account_deletion(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'Account not found' using errcode='42501';
  end if;
  if exists(select 1 from private.admin_roles where user_id=p_actor) then
    raise exception 'Transfer administrator responsibilities and remove your administrator role through the community owner before deletion' using errcode='42501';
  end if;
  -- Match event-first registration lock order; no deletion/cleanup happens here.
  perform 1 from public.meetups where host_id=p_actor order by id for update;
  perform 1 from private.member_access where user_id=p_actor for update;
  if not found then raise exception 'Account access record not found'; end if;
  if exists(select 1 from public.meetups where host_id=p_actor and status='published' and starts_at>clock_timestamp()) then
    raise exception 'Cancel your upcoming published events before deleting your account';
  end if;
  -- Never delete unrelated bucket data just because the user owns it.
  if exists(select 1 from storage.objects o where o.owner_id=p_actor::text and not (
    (o.bucket_id='profile-photos' and split_part(o.name,'/',1)=p_actor::text)
    or (o.bucket_id='event-covers' and exists(select 1 from public.meetups m where m.host_id=p_actor and split_part(o.name,'/',1)=m.id::text)))) then
    raise exception 'Other stored files require support-assisted deletion';
  end if;
  insert into private.account_deletions(user_id) values(p_actor) on conflict do nothing;
  -- Retrying is supported for suspended/deletion-pending accounts as well.
  update private.member_access set status='suspended',reason='Account deletion in progress',updated_at=now(),updated_by=null where user_id=p_actor;
end;
$$;

create function private.protect_deletion_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and exists(select 1 from private.account_deletions where user_id=new.user_id) then
    raise exception 'Account deletion is in progress; finish deletion before restoring access';
  end if;
  return new;
end;
$$;
create trigger protect_deletion_access before update on private.member_access
for each row execute function private.protect_deletion_access();

create function public.account_deletion_files(p_actor uuid)
returns table(bucket_id text,name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from private.account_deletions where user_id=p_actor) then
    raise exception 'Start account deletion before removing files' using errcode='42501';
  end if;
  -- Includes unlinked/replaced files, and covers uploaded with service credentials.
  return query select o.bucket_id,o.name from storage.objects o where
    (o.bucket_id='profile-photos' and split_part(o.name,'/',1)=p_actor::text)
    or (o.bucket_id='event-covers' and exists(select 1 from public.meetups m
      where m.host_id=p_actor and split_part(o.name,'/',1)=m.id::text))
    order by o.bucket_id,o.name limit 100;
end;
$$;

revoke all on function private.protect_deletion_access() from public,anon,authenticated;
revoke all on function public.get_account_deletion_summary(),public.prepare_account_deletion(uuid),public.account_deletion_files(uuid),public.consume_account_deletion_attempt(uuid)
  from public,anon,authenticated;
grant execute on function public.get_account_deletion_summary() to authenticated;
grant execute on function public.prepare_account_deletion(uuid),public.account_deletion_files(uuid),public.consume_account_deletion_attempt(uuid) to service_role;
notify pgrst,'reload schema';
commit;
