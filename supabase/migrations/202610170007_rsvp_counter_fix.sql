-- Follow-up to instant_rsvps: avoid counting an upsert twice in BEFORE triggers.
-- Earlier applied migrations remain immutable. No registrations are removed.
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
  -- A BEFORE INSERT trigger also runs before an ON CONFLICT UPDATE. Keep the
  -- branches separate so a returning member consumes exactly one seat.
  if r.meetup_id is not null then
    update public.meetup_requests set status='approved',decided_at=now(),decided_by=null
      where meetup_id=p_meetup_id and user_id=actor returning * into r;
  else
    insert into public.meetup_requests(meetup_id,user_id,status,decided_at)
      values(p_meetup_id,actor,'approved',now()) returning * into r;
  end if;
  return r;
end;
$$;

-- Repair only mismatched counters; preserve confirmed RSVPs and their history.
-- The existing capacity CHECK aborts the entire transaction if data is invalid.
update public.meetups m set approved_count=(
  select count(*) from public.meetup_requests r where r.meetup_id=m.id and r.status='approved'
) where m.approved_count is distinct from (
  select count(*) from public.meetup_requests r where r.meetup_id=m.id and r.status='approved'
);
commit;
