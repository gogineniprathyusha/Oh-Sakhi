begin;

-- Buckets stay private; a public bucket bypasses download policies.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
  ('profile-photos','profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']),
  ('event-covers','event-covers',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create function private.can_write_avatar(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member()
    and p_name ~ ('^' || auth.uid()::text || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$');
$$;
create function private.can_write_cover(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists (select 1 from public.meetups m
    where p_name ~ ('^' || m.id::text || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$')
      and (private.is_admin() or (m.host_id = auth.uid() and m.status = 'draft')));
$$;
create function private.can_read_cover(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meetups m where
    (p_name = m.cover_path and private.can_view_meetup(m.id))
    or (private.is_active_member() and (private.is_admin() or m.host_id = auth.uid())
      and p_name ~ ('^' || m.id::text || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$')));
$$;
create function private.avatar_read_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and (private.can_write_avatar(p_name) or private.is_admin());
$$;
grant execute on function private.can_write_avatar(text), private.can_write_cover(text) to authenticated;
grant execute on function private.can_read_cover(text) to anon, authenticated;

-- UUID-prefixed paths are immutable. Upload a new filename rather than overwriting
-- a reviewed image. File bytes/type validation belongs to the upload endpoint in Stage C.
create policy her_hour_avatar_read on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and (select private.is_active_member())
    and (private.can_write_avatar(name) or (select private.is_admin())));
create policy her_hour_avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and private.can_write_avatar(name)
    and owner_id = (select auth.uid())::text);
create policy her_hour_avatar_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and private.can_write_avatar(name)
    and owner_id = (select auth.uid())::text);
create policy her_hour_cover_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-covers' and private.can_read_cover(name));
create policy her_hour_cover_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-covers' and private.can_write_cover(name)
    and owner_id = (select auth.uid())::text);
create policy her_hour_cover_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-covers' and private.can_write_cover(name)
    and (owner_id = (select auth.uid())::text or (select private.is_admin())));

-- A project's older permissive policies are OR-ed with new policies. These
-- restrictive boundaries protect our buckets even if such a policy already exists;
-- other apps' buckets are unaffected. No overwrites of reviewed files are allowed.
create policy her_hour_read_boundary on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id not in ('profile-photos','event-covers')
    or (bucket_id = 'profile-photos' and private.avatar_read_allowed(name))
    or (bucket_id = 'event-covers' and private.can_read_cover(name)));
create policy her_hour_insert_boundary on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id not in ('profile-photos','event-covers')
    or (owner_id = (select auth.uid())::text and
      ((bucket_id = 'profile-photos' and private.can_write_avatar(name))
       or (bucket_id = 'event-covers' and private.can_write_cover(name)))));
create policy her_hour_update_boundary on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id not in ('profile-photos','event-covers'))
  with check (bucket_id not in ('profile-photos','event-covers'));
create policy her_hour_delete_boundary on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id not in ('profile-photos','event-covers')
    or (bucket_id = 'profile-photos' and private.can_write_avatar(name) and owner_id = (select auth.uid())::text)
    or (bucket_id = 'event-covers' and private.can_write_cover(name)
      and (owner_id = (select auth.uid())::text or private.is_admin())));

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member(), private.is_admin() to anon, authenticated;
grant execute on function private.can_view_meetup(uuid), private.can_read_cover(text),
  private.can_write_avatar(text), private.can_write_cover(text), private.avatar_read_allowed(text) to anon, authenticated;
commit;
