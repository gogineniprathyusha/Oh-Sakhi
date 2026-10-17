-- Stage C: cover bytes are validated by the event-image function before linking.
-- Deploy event-image first, then apply this migration. Existing references survive.
begin;
revoke insert (cover_path), update (cover_path) on public.meetups from authenticated;
create policy event_cover_server_insert on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'event-covers');
create policy event_cover_server_delete on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'event-covers');

-- These RPCs are called only with the function's server credential, after getUser.
-- They accept a verified actor explicitly and recheck ownership/access in PostgreSQL.
create function public.authorize_event_image(p_actor uuid, p_event uuid) returns public.meetups
language plpgsql security definer set search_path = '' as $$
declare m public.meetups; used integer;
begin
  select * into m from public.meetups where id=p_event;
  if m.id is null or m.host_id<>p_actor or not exists
    (select 1 from private.member_access where user_id=p_actor and status='active') then
    raise exception 'Only the active event organiser can change this cover' using errcode='42501';
  end if;
  if m.status not in ('draft','published') or (m.status='published' and m.starts_at<=clock_timestamp()) then
    raise exception 'This event is closed';
  end if;
  insert into private.rate_limits(user_id,operation,window_start,hits)
    values(p_actor,'event_image',clock_timestamp(),1)
  on conflict(user_id,operation) do update set
    hits=case when private.rate_limits.window_start<clock_timestamp()-interval '1 hour' then 1 else private.rate_limits.hits+1 end,
    window_start=case when private.rate_limits.window_start<clock_timestamp()-interval '1 hour' then clock_timestamp() else private.rate_limits.window_start end
  returning hits into used;
  if used>40 then raise exception 'Too many cover changes. Try again later'; end if;
  return m;
end;
$$;
create function public.commit_event_image(p_actor uuid,p_event uuid,p_previous text,p_path text) returns public.meetups
language plpgsql security definer set search_path = '' as $$
declare m public.meetups;
begin
  select * into m from public.meetups where id=p_event for update;
  if m.id is null or m.host_id<>p_actor or not exists
    (select 1 from private.member_access where user_id=p_actor and status='active') then
    raise exception 'Only the active event organiser can change this cover' using errcode='42501';
  end if;
  if m.status not in ('draft','published') or (m.status='published' and m.starts_at<=clock_timestamp()) then
    raise exception 'This event is closed';
  end if;
  if m.cover_path is distinct from p_previous then raise exception 'The cover changed in another window. Reload and try again'; end if;
  if p_path is not null and (p_path !~ ('^'||p_event::text||'/[a-zA-Z0-9_-]+\.webp$') or not exists
    (select 1 from storage.objects where bucket_id='event-covers' and name=p_path)) then
    raise exception 'A validated uploaded cover is required';
  end if;
  update public.meetups set cover_path=p_path where id=p_event returning * into m;
  return m;
end;
$$;
revoke all on function public.authorize_event_image(uuid,uuid), public.commit_event_image(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.authorize_event_image(uuid,uuid), public.commit_event_image(uuid,uuid,text,text) to service_role;
commit;
