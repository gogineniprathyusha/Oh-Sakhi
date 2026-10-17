-- Instant RSVPs replace organiser attendance decisions. Apply after event_images.
-- Keep existing confirmed seats and all registration/history rows.
begin;
lock table public.meetups, public.meetup_requests in access exclusive mode;

create or replace function public.request_meetup(p_meetup_id uuid) returns public.meetup_requests
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); m public.meetups; r public.meetup_requests;
begin
  -- The event lock serializes reservations, withdrawals, capacity edits and closure.
  select * into m from public.meetups where id=p_meetup_id for update;
  perform private.require_member();
  if m.id is null or m.status<>'published' or m.host_id=actor or not exists
    (select 1 from private.member_access where user_id=m.host_id and status='active') then
    raise exception 'This event is not open for RSVPs' using errcode='42501';
  end if;
  if clock_timestamp()>=m.registration_deadline or clock_timestamp()>=m.starts_at then
    raise exception 'Registration has closed';
  end if;
  select * into r from public.meetup_requests where meetup_id=p_meetup_id and user_id=actor;
  if found and r.status='approved' then return r; end if;
  if m.approved_count>=m.capacity then raise exception 'This event is full'; end if;
  perform private.consume_limit('request_meetup',20,3600);
  insert into public.meetup_requests(meetup_id,user_id,status,decided_at)
    values(p_meetup_id,actor,'approved',now())
  on conflict(meetup_id,user_id) do update set status='approved',decided_at=now(),decided_by=null
  returning * into r;
  return r;
end;
$$;
alter table public.meetup_requests alter column status set default 'approved';

-- Retire the old public approval/decline API as well as its UI.
revoke all on function public.decide_meetup_request(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Resolve legacy pending rows deterministically. Available seats go to the oldest
-- requests first. Ineligible/full-event requests become cancelled history, not a waitlist.
-- Existing approved and declined rows are untouched. A member may RSVP again later.
do $$
declare r record; m public.meetups;
begin
  for r in select meetup_id,user_id from public.meetup_requests where status='pending'
    order by meetup_id,created_at,user_id
  loop
    select * into m from public.meetups where id=r.meetup_id for update;
    if m.status='published' and m.starts_at>clock_timestamp() and m.host_id<>r.user_id
      and m.approved_count<m.capacity
      and exists(select 1 from private.member_access where user_id=m.host_id and status='active')
      and exists(select 1 from private.member_access where user_id=r.user_id and status='active') then
      update public.meetup_requests set status='approved',decided_at=now(),decided_by=null
        where meetup_id=r.meetup_id and user_id=r.user_id;
    else
      update public.meetup_requests set status='cancelled',decided_at=null,decided_by=null
        where meetup_id=r.meetup_id and user_id=r.user_id;
    end if;
  end loop;
end $$;
commit;
