-- Add organiser publication and RSVP notifications without changing attendee delivery.
-- Apply once after event_emails. Organiser delivery starts disabled for staged rollout.
begin;
alter table private.email_config add column organiser_enabled boolean not null default false;
alter table private.event_emails
  drop constraint event_emails_kind_check,
  add constraint event_emails_kind_check check (kind in
    ('confirmation','update','cancellation','reminder','organiser_published','organiser_rsvp')),
  add column related_user_id uuid references public.profiles(id) on delete cascade,
  add constraint event_emails_related_user_check check
    ((kind='organiser_rsvp' and related_user_id is not null) or (kind<>'organiser_rsvp' and related_user_id is null));
create index event_emails_related_user_idx on private.event_emails(related_user_id) where related_user_id is not null;

create function private.queue_organiser_publication_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not (select enabled and organiser_enabled from private.email_config) then return new; end if;
  if new.status='published' and new.starts_at>clock_timestamp()
    and (tg_op='INSERT' or old.status is distinct from 'published') then
    -- The event UUID is a stable publication identity; revision distinguishes republishing.
    insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
      values(new.id,new.host_id,new.id,'organiser_published',new.email_revision,private.email_event(new),now())
      on conflict(meetup_id,user_id,registration_id,kind,revision) do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_organiser_publication_email after insert or update of status on public.meetups
for each row execute function private.queue_organiser_publication_email();

create function private.queue_organiser_registration_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetups; attendee_name text;
begin
  if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved') then
    if not (select enabled and organiser_enabled from private.email_config) then return new; end if;
    select * into m from public.meetups where id=new.meetup_id;
    if m.status<>'published' or m.starts_at<=clock_timestamp() or m.host_id=new.user_id then return new; end if;
    select display_name into attendee_name from public.profiles where id=new.user_id;
    insert into private.event_emails(meetup_id,user_id,related_user_id,registration_id,kind,revision,event,due_at)
      values(m.id,m.host_id,new.user_id,new.email_registration_id,'organiser_rsvp',m.email_revision,
        private.email_event(m)||jsonb_build_object('attendee_name',attendee_name),now())
      on conflict(meetup_id,user_id,registration_id,kind,revision) do nothing;
  elsif new.status is distinct from 'approved' then
    update private.event_emails set state='cancelled',lease_token=null,leased_until=null
      where meetup_id=new.meetup_id and related_user_id=new.user_id and kind='organiser_rsvp' and state in ('queued','processing');
  end if;
  return new;
end;
$$;
create trigger queue_organiser_registration_email after insert or update of status on public.meetup_requests
for each row execute function private.queue_organiser_registration_email();

create or replace function private.queue_event_emails() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.meetup_requests;
begin
  if new.email_revision=old.email_revision then return new; end if;
  -- Changing time/location or closing invalidates unsent versions, including leases.
  update private.event_emails set state='cancelled',lease_token=null,leased_until=null
    where meetup_id=new.id and state in ('queued','processing') and (
      kind in ('confirmation','update','reminder')
      or (new.status<>'published' and kind in ('organiser_published','organiser_rsvp')));
  if not (select enabled from private.email_config) then return new; end if;
  if old.status='published' and new.status in ('cancelled','removed') then
    -- This AFTER event trigger runs before the status RPC cancels its registrations.
    insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
      select new.id,user_id,email_registration_id,'cancellation',new.email_revision,private.email_event(new),now()
      from public.meetup_requests where meetup_id=new.id and status='approved';
  elsif new.status='published' and new.starts_at>clock_timestamp() then
    for r in select * from public.meetup_requests where meetup_id=new.id and status='approved' loop
      if old.status='published' and (new.starts_at,new.timezone,new.place) is distinct from (old.starts_at,old.timezone,old.place) then
        insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,previous_event,due_at)
          values(new.id,r.user_id,r.email_registration_id,'update',new.email_revision,private.email_event(new),private.email_event(old),now());
      end if;
      if new.starts_at>clock_timestamp()+interval '24 hours' then
        insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
          values(new.id,r.user_id,r.email_registration_id,'reminder',new.email_revision,private.email_event(new),new.starts_at-interval '24 hours');
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create function private.attendee_email_is_eligible(j private.event_emails) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.meetups m
    join public.meetup_requests r on r.meetup_id=m.id and r.user_id=j.user_id
    join private.member_access a on a.user_id=j.user_id and a.status='active'
    join auth.users u on u.id=j.user_id and u.email_confirmed_at is not null
    where m.id=j.meetup_id and r.email_registration_id=j.registration_id
      and u.email is not null and not exists(select 1 from private.email_suppressions s where s.email_hash=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex'))
      and (j.recipient_email is null or j.recipient_email=u.email)
      and ((j.kind='cancellation' and m.status in ('cancelled','removed'))
        or (m.status='published' and m.starts_at>now() and r.status='approved'
          and m.email_revision=j.revision
          and exists(select 1 from private.member_access h where h.user_id=m.host_id and h.status='active'))));
$$;

create or replace function private.email_is_eligible(j private.event_emails) returns boolean
language sql stable security definer set search_path='' as $$
  select case when j.kind in ('organiser_published','organiser_rsvp') then
    (select enabled and organiser_enabled from private.email_config) and exists(
      select 1 from public.meetups m
      join private.member_access a on a.user_id=m.host_id and a.status='active'
      join auth.users u on u.id=m.host_id and u.email_confirmed_at is not null
      where m.id=j.meetup_id and j.user_id=m.host_id and m.status='published' and m.starts_at>now()
        and u.email is not null and (j.recipient_email is null or j.recipient_email=u.email)
        and not exists(select 1 from private.email_suppressions s
          where s.email_hash=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex'))
        and (j.kind='organiser_published' or exists(
          select 1 from public.meetup_requests r join private.member_access member
            on member.user_id=r.user_id and member.status='active'
          where r.meetup_id=m.id and r.user_id=j.related_user_id and r.user_id<>m.host_id
            and r.email_registration_id=j.registration_id and r.status='approved')))
    else private.attendee_email_is_eligible(j) end;
$$;

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
      -- Refresh organiser details before first send; retries keep the frozen provider body.
      event=case when kind in ('organiser_published','organiser_rsvp') and request_payload is null
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

revoke all on function private.queue_organiser_publication_email(),private.queue_organiser_registration_email(),
  private.attendee_email_is_eligible(private.event_emails) from public,anon,authenticated;
-- Existing service-only worker/webhook grants, delivery switch, leases and payloads are retained.
notify pgrst,'reload schema';
commit;
