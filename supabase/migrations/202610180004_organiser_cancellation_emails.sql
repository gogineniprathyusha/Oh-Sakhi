-- Confirm an organiser's own cancellation; existing delivery stays unchanged.
-- Deploy the expanded worker before enabling this new message kind.
begin;
alter table private.email_config add column organiser_cancellation_enabled boolean not null default false;
alter table private.event_emails
  drop constraint event_emails_kind_check,
  add constraint event_emails_kind_check check (kind in
    ('confirmation','update','cancellation','reminder','organiser_published','organiser_rsvp','organiser_cancelled'));

create function private.queue_organiser_cancellation_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not (select enabled and organiser_enabled and organiser_cancellation_enabled from private.email_config) then return new; end if;
  if new.status='cancelled' and old.status is distinct from 'cancelled' and new.host_id=auth.uid() then
    -- No attendee registration is needed. The event/revision identifies this transition.
    insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
      values(new.id,new.host_id,new.id,'organiser_cancelled',new.email_revision,private.email_event(new),now())
      on conflict(meetup_id,user_id,registration_id,kind,revision) do nothing;
  end if;
  return new;
end;
$$;
create trigger queue_organiser_cancellation_email after update of status on public.meetups
for each row execute function private.queue_organiser_cancellation_email();

create or replace function private.email_is_eligible(j private.event_emails) returns boolean
language sql stable security definer set search_path='' as $$
  select case when j.kind in ('organiser_published','organiser_rsvp','organiser_cancelled') then
    (select enabled and organiser_enabled from private.email_config) and exists(
      select 1 from public.meetups m
      join private.member_access a on a.user_id=m.host_id and a.status='active'
      join auth.users u on u.id=m.host_id and u.email_confirmed_at is not null
      where m.id=j.meetup_id and j.user_id=m.host_id
        and u.email is not null and (j.recipient_email is null or j.recipient_email=u.email)
        and not exists(select 1 from private.email_suppressions s
          where s.email_hash=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex'))
        and ((j.kind='organiser_cancelled' and m.status='cancelled'
            and (select organiser_cancellation_enabled from private.email_config))
          or (j.kind in ('organiser_published','organiser_rsvp') and m.status='published' and m.starts_at>now()
            and (j.kind='organiser_published' or exists(
              select 1 from public.meetup_requests r join private.member_access member
                on member.user_id=r.user_id and member.status='active'
              where r.meetup_id=m.id and r.user_id=j.related_user_id and r.user_id<>m.host_id
                and r.email_registration_id=j.registration_id and r.status='approved')))))
    else private.attendee_email_is_eligible(j) end;
$$;

revoke all on function private.queue_organiser_cancellation_email() from public,anon,authenticated;
-- Cancelled event details cannot be edited; its cancellation snapshot stays fixed.
-- Existing worker grants, frozen retry payloads and attendee rules are retained.
notify pgrst,'reload schema';
commit;
