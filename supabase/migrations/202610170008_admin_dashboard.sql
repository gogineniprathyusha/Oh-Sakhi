-- Stage D: bounded administrator reads, audited moderation and private exports.
-- Apply after rsvp_counter_fix. No existing records or roles are removed.
begin;

create index reports_reporter_idx on public.reports(reporter_id);
create index admin_audit_created_idx on private.admin_audit_log(created_at desc, id desc);
create index member_access_status_idx on private.member_access(status, user_id);

create function private.check_admin_page(p_offset integer, p_limit integer, p_search text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_offset is null or p_offset < 0 or p_offset > 1000000 or p_limit is null
    or p_limit not between 1 and 100 or p_search is null or char_length(p_search)>100 then
    raise exception 'Invalid page or search' using errcode='22023';
  end if;
end;
$$;

create or replace function public.admin_statistics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'members',(select count(*) from public.profiles),
    'active_members',(select count(*) from private.member_access where status='active'),
    'suspended_members',(select count(*) from private.member_access where status='suspended'),
    'draft_events',(select count(*) from public.meetups where status='draft'),
    'upcoming_events',(select count(*) from public.meetups m where m.status='published' and m.starts_at>now()
      and exists(select 1 from private.member_access a where a.user_id=m.host_id and a.status='active')),
    'confirmed_rsvps',(select count(*) from public.meetup_requests where status='approved'),
    'open_reports',(select count(*) from public.reports where status in ('open','reviewing')));
end;
$$;

create function public.admin_list_members(p_status text default 'all', p_search text default '', p_offset integer default 0, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.check_admin_page(p_offset,p_limit,p_search);
  if p_status is null or p_status not in ('all','active','suspended') then raise exception 'Invalid member filter'; end if;
  with matching as (
    select p.id,p.display_name,p.city,p.created_at,a.status,a.reason,a.updated_at,
      exists(select 1 from private.admin_roles r where r.user_id=p.id) as is_admin
    from public.profiles p join private.member_access a on a.user_id=p.id
    where (p_status='all' or a.status=p_status)
      and (p_search='' or strpos(lower(p.display_name),lower(p_search))>0 or p.id::text=p_search)
  ), page as (select * from matching order by created_at desc,id limit p_limit offset p_offset)
  select jsonb_build_object('total',(select count(*) from matching),'items',coalesce(
    (select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.admin_list_reports(p_status text default 'open', p_search text default '', p_offset integer default 0, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.check_admin_page(p_offset,p_limit,p_search);
  if p_status is null or p_status not in ('all','open','reviewing','resolved','dismissed') then raise exception 'Invalid report filter'; end if;
  with matching as (
    select r.*,m.title as event_title,m.status as event_status,p.display_name as reporter_name,
      reviewer.display_name as reviewer_name
    from public.reports r join public.meetups m on m.id=r.meetup_id
      join public.profiles p on p.id=r.reporter_id left join public.profiles reviewer on reviewer.id=r.reviewed_by
    where (p_status='all' or r.status=p_status)
      and (p_search='' or strpos(lower(m.title),lower(p_search))>0 or r.id::text=p_search)
  ), page as (select * from matching order by created_at desc,id limit p_limit offset p_offset)
  select jsonb_build_object('total',(select count(*) from matching),'items',coalesce(
    (select jsonb_agg(to_jsonb(page) order by created_at desc,id) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.admin_list_events(p_status text default 'all', p_search text default '', p_offset integer default 0, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.check_admin_page(p_offset,p_limit,p_search);
  if p_status is null or p_status not in ('all','draft','published','cancelled','completed','removed') then raise exception 'Invalid event filter'; end if;
  with matching as (
    select m.id,m.title,m.host_id,m.host_label,m.status,m.starts_at,m.timezone,m.capacity,m.approved_count,
      a.status as host_status
    from public.meetups m join private.member_access a on a.user_id=m.host_id
    where (p_status='all' or m.status=p_status)
      and (p_search='' or strpos(lower(m.title),lower(p_search))>0 or m.id::text=p_search)
  ), page as (select * from matching order by starts_at desc,id limit p_limit offset p_offset)
  select jsonb_build_object('total',(select count(*) from matching),'items',coalesce(
    (select jsonb_agg(to_jsonb(page) order by starts_at desc,id) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.admin_list_audit(p_offset integer default 0, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.check_admin_page(p_offset,p_limit,'');
  with page as (
    select l.*,p.display_name as actor_name from private.admin_audit_log l
      left join public.profiles p on p.id=l.actor_id
    order by l.created_at desc,l.id desc limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from private.admin_audit_log),'items',coalesce(
    (select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.set_member_access(p_user_id uuid,p_status text,p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=private.require_admin(); previous text;
begin
  if p_status is null or p_status not in ('active','suspended') then raise exception 'Invalid member status'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 500 then raise exception 'Provide an access-change reason (10–500 characters)'; end if;
  -- Role/access changes for administrators stay in the trusted SQL workflow.
  if exists(select 1 from private.admin_roles where user_id=p_user_id) then
    raise exception 'Administrator access must be managed through the trusted SQL workflow' using errcode='42501';
  end if;
  select status into previous from private.member_access where user_id=p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  perform private.require_admin();
  if previous=p_status then return; end if;
  update private.member_access set status=p_status,reason=btrim(p_reason),updated_by=actor,updated_at=now() where user_id=p_user_id;
  insert into private.admin_audit_log(actor_id,action,target_id,details)
    values(actor,'member_access',p_user_id,jsonb_build_object('from',previous,'status',p_status,'reason',btrim(p_reason)));
end;
$$;

create or replace function public.review_report(p_report_id uuid,p_status text,p_note text default '') returns public.reports
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=private.require_admin(); r public.reports; previous text;
begin
  if p_status is null or p_status not in ('open','reviewing','resolved','dismissed') then raise exception 'Invalid report status'; end if;
  if p_note is null or char_length(btrim(p_note))>1000 or (p_status in ('resolved','dismissed') and char_length(btrim(p_note))<10) then
    raise exception 'Closed reports require a review note (10–1000 characters)';
  end if;
  select * into r from public.reports where id=p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  perform private.require_admin(); previous=r.status;
  update public.reports set status=p_status,resolution_note=btrim(p_note),reviewed_by=actor,reviewed_at=now()
    where id=p_report_id returning * into r;
  insert into private.admin_audit_log(actor_id,action,target_id,details)
    values(actor,'review_report',p_report_id,jsonb_build_object('from',previous,'status',p_status,'note',btrim(p_note)));
  return r;
end;
$$;

create function public.export_meetup_attendees(p_meetup_id uuid)
returns table(user_id uuid,display_name text,status text,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=private.require_member();
begin
  if not exists(select 1 from public.meetups m where m.id=p_meetup_id and (m.host_id=actor or private.is_admin())) then
    raise exception 'Host or administrator access required' using errcode='42501';
  end if;
  perform private.consume_limit('attendee_export',30,3600);
  insert into private.admin_audit_log(actor_id,action,target_id,details)
    values(actor,'attendee_export',p_meetup_id,jsonb_build_object('scope','registration_history'));
  return query select * from public.get_meetup_attendees(p_meetup_id);
end;
$$;

revoke all on function private.check_admin_page(integer,integer,text) from public,anon,authenticated;
revoke all on function public.admin_list_members(text,text,integer,integer),public.admin_list_reports(text,text,integer,integer),
  public.admin_list_events(text,text,integer,integer),public.admin_list_audit(integer,integer),public.export_meetup_attendees(uuid)
  from public,anon,authenticated;
grant execute on function public.admin_list_members(text,text,integer,integer),public.admin_list_reports(text,text,integer,integer),
  public.admin_list_events(text,text,integer,integer),public.admin_list_audit(integer,integer),public.export_meetup_attendees(uuid)
  to authenticated;
-- Replacement functions retain their original authenticated grants and internal role checks.
notify pgrst,'reload schema';
commit;
