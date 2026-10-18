-- Confirm a member's own seat cancellation without changing event cancellation delivery.
-- New delivery starts disabled; deploy the expanded worker before activation.
begin;
alter table private.email_config add column rsvp_cancellation_enabled boolean not null default false;
alter table private.event_emails
  drop constraint event_emails_kind_check,
  add constraint event_emails_kind_check check (kind in
    ('confirmation','update','cancellation','reminder','organiser_published','organiser_rsvp','organiser_cancelled','rsvp_cancelled'));

create function private.queue_rsvp_cancellation_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetups;
begin
  if new.status='approved' then
    -- Rejoining invalidates a queued or leased withdrawal notice from an older reservation.
    update private.event_emails set state='cancelled',lease_token=null,leased_until=null
      where meetup_id=new.meetup_id and user_id=new.user_id and kind='rsvp_cancelled' and state in ('queued','processing');
  elsif new.status='cancelled' and old.status='approved' and new.user_id=auth.uid() then
    if not (select enabled and rsvp_cancellation_enabled from private.email_config) then return new; end if;
    select * into m from public.meetups where id=new.meetup_id;
    -- Whole-event closure is handled by the separate attendee cancellation message.
    if m.status<>'published' then return new; end if;
    insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
      values(m.id,new.user_id,new.email_registration_id,'rsvp_cancelled',m.email_revision,private.email_event(m),now())
      on conflict(meetup_id,user_id,registration_id,kind,revision) do nothing;
  end if;
  return new;
end;
$$;
-- Run after queue_registration_emails has cancelled the member's pending updates/reminders.
create trigger z_queue_rsvp_cancellation_email after update of status on public.meetup_requests
for each row execute function private.queue_rsvp_cancellation_email();

create or replace function private.attendee_email_is_eligible(j private.event_emails) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.meetups m
    join public.meetup_requests r on r.meetup_id=m.id and r.user_id=j.user_id
    join private.member_access a on a.user_id=j.user_id and a.status='active'
    join auth.users u on u.id=j.user_id and u.email_confirmed_at is not null
    where m.id=j.meetup_id and r.email_registration_id=j.registration_id
      and u.email is not null and not exists(select 1 from private.email_suppressions s where s.email_hash=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex'))
      and (j.recipient_email is null or j.recipient_email=u.email)
      and ((j.kind='rsvp_cancelled' and r.status='cancelled' and m.status='published'
          and (select enabled and rsvp_cancellation_enabled from private.email_config))
        or (j.kind='cancellation' and m.status in ('cancelled','removed'))
        or (j.kind in ('confirmation','update','reminder') and m.status='published' and m.starts_at>now() and r.status='approved'
          and m.email_revision=j.revision
          and exists(select 1 from private.member_access h where h.user_id=m.host_id and h.status='active'))));
$$;

revoke all on function private.queue_rsvp_cancellation_email() from public,anon,authenticated;
-- Existing eligibility wrapper retains all organiser rules and calls the attendee helper.
-- Existing browser grants, registration generations, retry payloads and history are preserved.

create or replace function public.claim_event_email() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.event_emails; email text; scanned integer;
begin
  if not (select enabled from private.email_config) then return null; end if;
  -- No retry beyond Resend's 24-hour deduplication window; ambiguous jobs need review.
  update private.event_emails set state='dead',last_error='retry_window_expired',lease_token=null
    where state in ('queued','processing') and
      (first_attempt_at<now()-interval '23 hours' or (attempts>=8 and (leased_until is null or leased_until<now())));
  for scanned in 1..20 loop
    -- A cursor FOR loop prefetches and locks extra rows. Claim only one candidate.
    select * into j from private.event_emails
      where (state='queued' and due_at<=now()) or (state='processing' and leased_until<now())
      order by due_at,id limit 1 for update skip locked;
    if not found then return null; end if;
    if not private.email_is_eligible(j) then
      update private.event_emails set state='cancelled',last_error='no_longer_eligible',lease_token=null where id=j.id;
      continue;
    end if;
    select u.email into email from auth.users u where u.id=j.user_id;
    update private.event_emails set state='processing',attempts=attempts+1,
      -- Refresh organiser/withdrawal details before first send; retries keep the frozen provider body.
      event=case when kind in ('organiser_published','organiser_rsvp','rsvp_cancelled') and request_payload is null
        then event||(select private.email_event(m) from public.meetups m where m.id=j.meetup_id)
        else event end,
      lease_token=gen_random_uuid(),leased_until=now()+interval '2 minutes',
      first_attempt_at=coalesce(first_attempt_at,now()),recipient_email=coalesce(recipient_email,email)
      where id=j.id returning * into j;
    return jsonb_build_object('id',j.id,'lease_token',j.lease_token,'kind',j.kind,
      'event',j.event,'previous_event',j.previous_event,'email',j.recipient_email,'payload',j.request_payload,'attempts',j.attempts);
  end loop;
  return null;
end;
$$;


notify pgrst,'reload schema';
commit;
