-- Revised product rules: organisers publish immediately and control their own seats.
-- Earlier migration files remain immutable. Apply this migration after Stage A.
begin;
alter table public.meetups drop constraint meetups_status_check;
alter table public.meetups add constraint meetups_status_check
  check (status in ('draft','published','cancelled','completed','removed'));
alter table public.meetups alter column status set default 'published';
alter table public.meetups add column details_updated_at timestamptz;
grant insert (status) on public.meetups to authenticated;
drop policy meetups_submit on public.meetups;
create policy meetups_submit on public.meetups for insert to authenticated
  with check ((select private.is_active_member()) and host_id = (select auth.uid()) and status in ('draft','published'));

create or replace function private.guard_meetup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed boolean;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then raise exception 'Invalid event timezone'; end if;
  if tg_op = 'INSERT' then
    if new.starts_at is null then new.starts_at = (new.event_date + new.event_time) at time zone new.timezone; end if;
    new.registration_deadline = coalesce(new.registration_deadline,new.starts_at);
    if auth.uid() is not null then
      perform private.require_member(); perform private.consume_limit('submit_meetup',10,3600);
      if new.host_id <> auth.uid() then raise exception 'Create events under your own account' using errcode='42501'; end if;
      if new.status not in ('draft','published') or new.approved_count <> 0 then raise exception 'Invalid initial event state'; end if;
      if new.status='published' and (new.starts_at <= clock_timestamp() or new.registration_deadline <= clock_timestamp()) then
        raise exception 'Choose a future event and registration deadline'; end if;
    end if;
  else
    if (new.host_id,new.id) is distinct from (old.host_id,old.id) then raise exception 'Event ownership cannot change' using errcode='42501'; end if;
    if (new.event_date,new.event_time) is distinct from (old.event_date,old.event_time) and new.starts_at is not distinct from old.starts_at then
      new.starts_at=(new.event_date+new.event_time) at time zone new.timezone;
      if new.registration_deadline=old.starts_at then new.registration_deadline=new.starts_at; end if;
    end if;
    changed=row(new.title,new.category,new.description,new.place,new.capacity,new.starts_at,new.ends_at,new.registration_deadline,new.cover_path,new.host_label,new.timezone)
      is distinct from row(old.title,old.category,old.description,old.place,old.capacity,old.starts_at,old.ends_at,old.registration_deadline,old.cover_path,old.host_label,old.timezone);
    if auth.uid() is not null then
      perform private.require_member();
      if new.status is distinct from old.status then
        if new.status='removed' then perform private.require_admin();
        elsif old.status='removed' or old.status in ('cancelled','completed') then raise exception 'Closed or removed events cannot reopen';
        elsif new.host_id <> auth.uid() then raise exception 'Only the organiser changes event status' using errcode='42501'; end if;
      end if;
      if changed and old.status in ('removed','cancelled','completed') then raise exception 'This event is closed'; end if;
      if changed and new.status='published' and new.starts_at<=clock_timestamp() then raise exception 'Choose a future event time'; end if;
      -- Host edits keep the event published; registrations and ownership are retained.
    end if;
    if changed then new.details_updated_at=clock_timestamp(); end if;
  end if;
  new.event_date=(new.starts_at at time zone new.timezone)::date;
  new.event_time=(new.starts_at at time zone new.timezone)::time;
  new.updated_at=now(); return new;
end;
$$;

create or replace function public.set_meetup_status(p_meetup_id uuid,p_status text) returns public.meetups
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=private.require_member(); m public.meetups; previous text;
begin
  if p_status is null or p_status not in ('draft','published','cancelled','completed') then raise exception 'Invalid organiser event status'; end if;
  select * into m from public.meetups where id=p_meetup_id for update;
  perform private.require_member();
  if m.id is null or m.host_id<>actor then raise exception 'Only the organiser changes event status' using errcode='42501'; end if;
  previous=m.status;
  if m.status in ('removed','cancelled','completed') and p_status<>m.status then raise exception 'Closed or removed events cannot reopen'; end if;
  if p_status='published' and (m.starts_at<=clock_timestamp() or m.registration_deadline<=clock_timestamp()) then raise exception 'Choose a future event and registration deadline'; end if;
  if p_status='completed' and m.starts_at>clock_timestamp() then raise exception 'Event has not started'; end if;
  update public.meetups set status=p_status where id=p_meetup_id returning * into m;
  if p_status='cancelled' then
    update public.meetup_requests set status='cancelled' where meetup_id=p_meetup_id and status in ('pending','approved');
    select * into m from public.meetups where id=p_meetup_id;
  end if;
  insert into private.admin_audit_log(actor_id,action,target_id,details)
    values(actor,'organiser_event_status',p_meetup_id,jsonb_build_object('from',previous,'to',p_status));
  return m;
end;
$$;

create or replace function public.decide_meetup_request(p_meetup_id uuid,p_user_id uuid,p_decision text)
returns public.meetup_requests language plpgsql security definer set search_path = '' as $$
declare actor uuid:=private.require_member(); m public.meetups; r public.meetup_requests;
begin
  if p_decision is null or p_decision not in ('approved','declined') then raise exception 'Choose approved or declined'; end if;
  select * into m from public.meetups where id=p_meetup_id for update;
  perform private.require_member();
  if m.id is null or m.host_id<>actor or actor=p_user_id then raise exception 'Only the event organiser decides attendance' using errcode='42501'; end if;
  if m.status<>'published' or clock_timestamp()>=m.starts_at then raise exception 'This event is closed'; end if;
  select * into r from public.meetup_requests where meetup_id=p_meetup_id and user_id=p_user_id for update;
  -- Hosts may reconsider a declined request, but cannot undo a member's own withdrawal.
  if not found or r.status='cancelled' then raise exception 'No actionable request; the member must request again'; end if;
  if p_decision='approved' then
    if not exists(select 1 from private.member_access where user_id=p_user_id and status='active') then raise exception 'The member is inactive'; end if;
    if r.status='approved' then return r; end if;
    if m.approved_count>=m.capacity then raise exception 'This event is full; increase capacity before approval'; end if;
  end if;
  -- An organiser can decide/reconsider an existing request after its submission deadline,
  -- up until the event starts. New member requests still obey the deadline.
  update public.meetup_requests set status=p_decision,decided_by=actor,decided_at=now()
    where meetup_id=p_meetup_id and user_id=p_user_id returning * into r;
  return r;
end;
$$;

create function public.moderate_meetup(p_meetup_id uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=private.require_admin(); m public.meetups;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then raise exception 'Provide a removal reason (10–1000 characters)'; end if;
  select * into m from public.meetups where id=p_meetup_id for update;
  if not found then raise exception 'Event not found'; end if;
  update public.meetups set status='removed' where id=p_meetup_id;
  update public.meetup_requests set status='cancelled' where meetup_id=p_meetup_id and status in ('pending','approved');
  insert into private.admin_audit_log(actor_id,action,target_id,details)
    values(actor,'event_removed',p_meetup_id,jsonb_build_object('from',m.status,'reason',btrim(p_reason)));
end;
$$;
revoke all on function public.moderate_meetup(uuid,text) from public,anon,authenticated;
grant execute on function public.moderate_meetup(uuid,text) to authenticated;

create or replace function private.can_view_meetup(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.meetups m where m.id=p_id and (
    (auth.uid() is null and m.status='published' and exists(select 1 from private.member_access a where a.user_id=m.host_id and a.status='active'))
    or (private.is_active_member() and (private.is_admin() or m.host_id=auth.uid()
      or (m.status<>'removed' and (
        (m.status='published' and exists(select 1 from private.member_access a where a.user_id=m.host_id and a.status='active'))
        or exists(select 1 from public.meetup_requests r where r.meetup_id=m.id and r.user_id=auth.uid())))))
  ));
$$;
create or replace function private.can_write_cover(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists(select 1 from public.meetups m
    where m.status in ('draft','published') and (m.host_id=auth.uid() or private.is_admin())
    and p_name ~ ('^'||m.id::text||'/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$'));
$$;
-- Views expand m.* when created; append the new field without changing existing columns.
create or replace view public.meetup_directory with (security_invoker = true) as
select m.id,m.host_id,m.title,m.category,m.event_date,m.event_time,m.place,m.capacity,
  m.description,m.created_at,m.status,m.timezone,m.starts_at,m.ends_at,m.registration_deadline,
  m.cover_path,m.host_label,m.approved_count,m.updated_at,m.host_label as host_name,m.details_updated_at
from public.meetups m;

-- Intentionally saved drafts remain drafts. Their organiser can publish them directly;
-- applying a migration must not unexpectedly publish unfinished/private drafts.
commit;
