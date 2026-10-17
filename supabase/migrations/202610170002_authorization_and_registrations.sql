begin;

create function private.can_view_meetup(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meetups m where m.id = p_id and (
    (auth.uid() is null and m.status = 'published' and exists
      (select 1 from private.member_access a where a.user_id = m.host_id and a.status = 'active'))
    or (private.is_active_member() and (private.is_admin() or m.host_id = auth.uid()
      or (m.status = 'published' and exists
        (select 1 from private.member_access a where a.user_id = m.host_id and a.status = 'active'))
      or exists (select 1 from public.meetup_requests r where r.meetup_id = m.id and r.user_id = auth.uid())))
  ));
$$;
grant execute on function private.can_view_meetup(uuid) to anon, authenticated;

create function private.guard_meetup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare material_change boolean;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid event timezone' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    if new.starts_at is null then new.starts_at = (new.event_date + new.event_time) at time zone new.timezone; end if;
    new.registration_deadline = coalesce(new.registration_deadline, new.starts_at);
    if auth.uid() is not null then
      perform private.require_member();
      perform private.consume_limit('submit_meetup', 10, 3600);
      if new.host_id <> auth.uid() and not private.is_admin() then
        raise exception 'Cannot submit a plan for another member' using errcode = '42501';
      end if;
      if new.status <> 'draft' and not private.is_admin() then
        raise exception 'Only administrators publish plans' using errcode = '42501';
      end if;
      if new.approved_count <> 0 then raise exception 'New events cannot have approved seats'; end if;
      if new.starts_at <= clock_timestamp() then raise exception 'Choose a future event time'; end if;
    end if;
  else
    if new.host_id is distinct from old.host_id or new.id is distinct from old.id then
      raise exception 'Event ownership and identity cannot change' using errcode = '42501';
    end if;
    -- Keep the original date/time API compatible while starts_at becomes canonical.
    if (new.event_date, new.event_time) is distinct from (old.event_date, old.event_time)
      and new.starts_at is not distinct from old.starts_at then
      new.starts_at = (new.event_date + new.event_time) at time zone new.timezone;
      if new.registration_deadline = old.starts_at then new.registration_deadline = new.starts_at; end if;
    end if;
    material_change = row(new.title,new.category,new.description,new.place,new.capacity,new.starts_at,
      new.ends_at,new.registration_deadline,new.cover_path,new.host_label,new.timezone)
      is distinct from row(old.title,old.category,old.description,old.place,old.capacity,old.starts_at,
      old.ends_at,old.registration_deadline,old.cover_path,old.host_label,old.timezone);
    if auth.uid() is not null and not private.is_admin() then
      perform private.require_member();
      if new.status is distinct from old.status then
        raise exception 'Only administrators change publication status' using errcode = '42501';
      end if;
      if material_change then
        if old.status not in ('draft','published') then raise exception 'This event is closed'; end if;
        -- A host's changed published plan needs a fresh administrator review.
        new.status = 'draft';
      end if;
    end if;
  end if;
  new.event_date = (new.starts_at at time zone new.timezone)::date;
  new.event_time = (new.starts_at at time zone new.timezone)::time;
  new.updated_at = now();
  return new;
end;
$$;
create trigger guard_meetup before insert or update on public.meetups
for each row execute function private.guard_meetup();

-- Atomic counter plus a CHECK constraint: capacity edits and approvals serialize on
-- the SAME meetup row. Raw registration mutations are not granted to browser roles.
drop trigger check_meetup_capacity on public.meetup_requests;
create function private.track_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare delta integer;
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      update public.meetups set approved_count = approved_count - 1 where id = old.meetup_id;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.meetup_id,new.user_id) is distinct from (old.meetup_id,old.user_id) then
    raise exception 'Registration ownership cannot change' using errcode = '42501';
  end if;
  delta = case when new.status = 'approved' then 1 else 0 end;
  if tg_op = 'UPDATE' then delta = delta - case when old.status = 'approved' then 1 else 0 end; end if;
  if delta <> 0 then
    update public.meetups set approved_count = approved_count + delta where id = new.meetup_id;
  end if;
  new.updated_at = now();
  if new.status = 'cancelled' then new.cancelled_at = now(); else new.cancelled_at = null; end if;
  return new;
end;
$$;
create trigger track_registration before insert or update or delete on public.meetup_requests
for each row execute function private.track_registration();
create function private.record_registration_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.registration_history (meetup_id,user_id,status,actor_id)
      values (new.meetup_id,new.user_id,new.status,auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.registration_history (meetup_id,user_id,previous_status,status,actor_id)
      values (new.meetup_id,new.user_id,old.status,new.status,auth.uid());
  end if;
  return new;
end;
$$;
create trigger record_registration_history after insert or update on public.meetup_requests
for each row execute function private.record_registration_history();

-- Replace all original broad policies, not just the frontend's queries.
drop policy profiles_read on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy meetups_read on public.meetups;
drop policy meetups_create on public.meetups;
drop policy meetups_update on public.meetups;
drop policy meetups_delete on public.meetups;
drop policy requests_read on public.meetup_requests;
drop policy requests_insert on public.meetup_requests;
drop policy requests_delete on public.meetup_requests;
drop policy requests_host_update on public.meetup_requests;
drop policy reports_create_own on public.reports;

revoke all on public.profiles, public.meetups, public.meetup_requests, public.reports,
  public.interests, public.member_interests, public.registration_history from public, anon, authenticated;
-- REVOKE table ALL does not revoke the column-level grants in the old migration.
revoke update (display_name,bio,interests,city) on public.profiles from authenticated;
revoke update (status) on public.meetup_requests from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name,bio,interests,city,neighborhood,avatar_path) on public.profiles to authenticated;
grant select on public.meetups to anon, authenticated;
grant insert (host_id,title,category,event_date,event_time,starts_at,ends_at,timezone,
  place,capacity,description,registration_deadline,cover_path,host_label) on public.meetups to authenticated;
grant update (title,category,event_date,event_time,starts_at,ends_at,timezone,place,capacity,
  description,registration_deadline,cover_path,host_label) on public.meetups to authenticated;
grant select on public.meetup_requests, public.member_interests, public.registration_history to authenticated;
grant select on public.interests to anon, authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_id,meetup_id,category,details) on public.reports to authenticated;
grant all on public.interests, public.member_interests, public.registration_history to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.interests enable row level security;
alter table public.member_interests enable row level security;
alter table public.registration_history enable row level security;
create policy profiles_private on public.profiles for select to authenticated
  using ((select private.is_active_member()) and (id = (select auth.uid()) or (select private.is_admin())));
create policy profiles_edit_own on public.profiles for update to authenticated
  using ((select private.is_active_member()) and id = (select auth.uid()))
  with check ((select private.is_active_member()) and id = (select auth.uid()));
create policy meetups_public on public.meetups for select to anon using (private.can_view_meetup(id));
create policy meetups_visible on public.meetups for select to authenticated
  using (((select private.is_active_member()) and (host_id = (select auth.uid()) or (select private.is_admin())))
    or private.can_view_meetup(id));
create policy meetups_submit on public.meetups for insert to authenticated
  with check ((select private.is_active_member()) and host_id = (select auth.uid()) and status = 'draft');
create policy meetups_edit on public.meetups for update to authenticated
  using ((select private.is_active_member()) and (host_id = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_active_member()) and (host_id = (select auth.uid()) or (select private.is_admin())));
create policy requests_visible on public.meetup_requests for select to authenticated
  using ((select private.is_active_member()) and (user_id = (select auth.uid()) or (select private.is_admin())
    or exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = (select auth.uid()))));
create policy interests_visible on public.interests for select to anon, authenticated using (true);
create policy member_interests_private on public.member_interests for select to authenticated
  using ((select private.is_active_member()) and (member_id = (select auth.uid()) or (select private.is_admin())));
create policy registration_history_private on public.registration_history for select to authenticated
  using ((select private.is_active_member()) and (user_id = (select auth.uid()) or (select private.is_admin())
    or exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = (select auth.uid()))));
create policy reports_admin_read on public.reports for select to authenticated using ((select private.is_admin()));
create policy reports_member_create on public.reports for insert to authenticated
  with check ((select private.is_active_member()) and reporter_id = (select auth.uid()) and status = 'open'
    and private.can_view_meetup(meetup_id));
create function private.limit_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then perform private.consume_limit('report', 5, 3600); end if;
  return new;
end;
$$;
create trigger limit_reports before insert on public.reports
for each row execute function private.limit_reports();

create function public.request_meetup(p_meetup_id uuid) returns public.meetup_requests
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); m public.meetups; r public.meetup_requests;
begin
  select * into m from public.meetups where id = p_meetup_id for update;
  perform private.require_member();
  if m.id is null or m.status <> 'published' or m.host_id = actor
    or not exists (select 1 from private.member_access where user_id = m.host_id and status = 'active') then
    raise exception 'This event is not open for requests' using errcode = '42501';
  end if;
  if clock_timestamp() >= m.registration_deadline or clock_timestamp() >= m.starts_at then
    raise exception 'Registration has closed';
  end if;
  select * into r from public.meetup_requests where meetup_id = p_meetup_id and user_id = actor;
  if found and r.status in ('pending','approved') then return r; end if;
  if r.status = 'declined' then raise exception 'The host has declined this request'; end if;
  if m.approved_count >= m.capacity then raise exception 'This event is full'; end if;
  perform private.consume_limit('request_meetup', 20, 3600);
  insert into public.meetup_requests (meetup_id,user_id) values (p_meetup_id,actor)
  on conflict (meetup_id,user_id) do update set status = 'pending', decided_at = null, decided_by = null
  returning * into r;
  return r;
end;
$$;

create function public.withdraw_meetup_request(p_meetup_id uuid) returns public.meetup_requests
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); r public.meetup_requests;
begin
  -- Every registration mutation takes the event lock first (same lock order).
  perform 1 from public.meetups where id = p_meetup_id for update;
  perform private.require_member();
  update public.meetup_requests set status = 'cancelled'
    where meetup_id = p_meetup_id and user_id = actor and status in ('pending','approved') returning * into r;
  return r;
end;
$$;

create function public.decide_meetup_request(p_meetup_id uuid, p_user_id uuid, p_decision text)
returns public.meetup_requests language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); m public.meetups; r public.meetup_requests;
begin
  if p_decision not in ('approved','declined') or p_decision is null then
    raise exception 'Choose approved or declined' using errcode = '22023';
  end if;
  select * into m from public.meetups where id = p_meetup_id for update;
  perform private.require_member();
  if m.id is null or (m.host_id <> actor and not private.is_admin()) or actor = p_user_id then
    raise exception 'Only the host or an administrator can decide another member request' using errcode = '42501';
  end if;
  if p_decision = 'approved' and (m.status <> 'published' or clock_timestamp() >= m.registration_deadline
    or clock_timestamp() >= m.starts_at or not exists
      (select 1 from private.member_access where user_id = p_user_id and status = 'active')
    or not exists (select 1 from private.member_access where user_id = m.host_id and status = 'active')) then
    raise exception 'Registration is closed or the member is inactive';
  end if;
  select * into r from public.meetup_requests where meetup_id = p_meetup_id and user_id = p_user_id for update;
  if not found or r.status not in ('pending','approved') then raise exception 'No actionable request'; end if;
  if r.status = 'approved' and p_decision = 'approved' then return r; end if;
  if p_decision = 'approved' and m.approved_count >= m.capacity then raise exception 'This event is full'; end if;
  update public.meetup_requests set status = p_decision, decided_by = actor, decided_at = now()
    where meetup_id = p_meetup_id and user_id = p_user_id returning * into r;
  return r;
end;
$$;

create function public.set_meetup_status(p_meetup_id uuid, p_status text) returns public.meetups
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); m public.meetups; previous text;
begin
  if p_status is null or p_status not in ('draft','published','cancelled','completed') then
    raise exception 'Invalid event status' using errcode = '22023'; end if;
  select * into m from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'Event not found'; end if;
  previous = m.status;
  if m.status in ('cancelled','completed') and p_status <> m.status then raise exception 'Closed events cannot reopen'; end if;
  if p_status = 'published' and (m.starts_at <= clock_timestamp() or m.registration_deadline <= clock_timestamp()
    or not exists (select 1 from private.member_access where user_id = m.host_id and status = 'active')) then
    raise exception 'A future event and an active host are required to publish'; end if;
  if p_status = 'completed' and m.starts_at > clock_timestamp() then raise exception 'Event has not started'; end if;
  update public.meetups set status = p_status where id = p_meetup_id returning * into m;
  if p_status = 'cancelled' then
    update public.meetup_requests set status = 'cancelled'
      where meetup_id = p_meetup_id and status in ('pending','approved');
    select * into m from public.meetups where id = p_meetup_id;
  end if;
  insert into private.admin_audit_log (actor_id,action,target_id,details)
    values (actor,'event_status',p_meetup_id,jsonb_build_object('from',previous,'to',p_status));
  return m;
end;
$$;

create function public.set_member_access(p_user_id uuid, p_status text, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin();
begin
  if p_status is null or p_status not in ('active','suspended') then raise exception 'Invalid member status'; end if;
  if actor = p_user_id and p_status = 'suspended' then raise exception 'Administrators cannot suspend themselves'; end if;
  update private.member_access set status = p_status, reason = coalesce(p_reason,''), updated_by = actor, updated_at = now()
    where user_id = p_user_id;
  if not found then raise exception 'Member not found'; end if;
  insert into private.admin_audit_log (actor_id,action,target_id,details)
    values (actor,'member_access',p_user_id,jsonb_build_object('status',p_status));
end;
$$;

create function public.review_report(p_report_id uuid, p_status text, p_note text default '') returns public.reports
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_admin(); r public.reports;
begin
  update public.reports set status = p_status, resolution_note = coalesce(p_note,''),
    reviewed_by = actor, reviewed_at = now() where id = p_report_id returning * into r;
  if not found then raise exception 'Report not found'; end if;
  insert into private.admin_audit_log (actor_id,action,target_id,details)
    values (actor,'review_report',p_report_id,jsonb_build_object('status',p_status));
  return r;
end;
$$;

create function public.set_member_interests(p_interest_ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); selected_names text[];
begin
  if p_interest_ids is null or cardinality(p_interest_ids) > 12 or exists
    (select 1 from unnest(p_interest_ids) v where v is null or not exists (select 1 from public.interests i where i.id = v)) then
    raise exception 'Choose up to 12 supported interests' using errcode = '22023'; end if;
  select coalesce(array_agg(name order by name),'{}') into selected_names
    from public.interests where id = any(p_interest_ids);
  update public.profiles set interests = selected_names where id = actor;
end;
$$;

create function public.get_meetup_attendees(p_meetup_id uuid)
returns table(user_id uuid, display_name text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_member();
  if not private.is_admin() and not exists
    (select 1 from public.meetups m where m.id = p_meetup_id and m.host_id = auth.uid()) then
    raise exception 'Host or administrator access required' using errcode = '42501'; end if;
  return query select r.user_id,p.display_name,r.status,r.created_at from public.meetup_requests r
    join public.profiles p on p.id = r.user_id where r.meetup_id = p_meetup_id order by r.created_at;
end;
$$;

create function public.get_my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status',a.status,'is_admin',private.is_admin())
    from private.member_access a where a.user_id = (select auth.uid());
$$;
create function public.admin_statistics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object('members',(select count(*) from public.profiles),
    'active_members',(select count(*) from private.member_access where status = 'active'),
    'draft_events',(select count(*) from public.meetups where status = 'draft'),
    'open_reports',(select count(*) from public.reports where status in ('open','reviewing')));
end;
$$;

-- No profile join: a public event uses the host's explicit event label, never a private bio/name.
create view public.meetup_directory with (security_invoker = true) as
  select m.*, m.host_label as host_name from public.meetups m;
grant select on public.meetup_directory to anon, authenticated;

revoke execute on function public.create_profile_on_signup(), public.touch_profile_updated_at(),
  public.keep_meetup_host(), public.enforce_meetup_capacity() from public, anon, authenticated;
revoke all on function public.request_meetup(uuid), public.withdraw_meetup_request(uuid),
  public.decide_meetup_request(uuid,uuid,text), public.set_meetup_status(uuid,text),
  public.set_member_access(uuid,text,text), public.review_report(uuid,text,text),
  public.set_member_interests(text[]), public.get_meetup_attendees(uuid),
  public.get_my_access(), public.admin_statistics() from public, anon, authenticated;
grant execute on function public.request_meetup(uuid), public.withdraw_meetup_request(uuid),
  public.decide_meetup_request(uuid,uuid,text), public.set_meetup_status(uuid,text),
  public.set_member_access(uuid,text,text), public.review_report(uuid,text,text),
  public.set_member_interests(text[]), public.get_meetup_attendees(uuid),
  public.get_my_access(), public.admin_statistics() to authenticated;
-- Also remove any global default function grants inherited from the project.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member(), private.is_admin() to authenticated;
grant execute on function private.can_view_meetup(uuid) to anon, authenticated;
commit;
