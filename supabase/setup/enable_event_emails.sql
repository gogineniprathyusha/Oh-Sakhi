-- HOSTED ACTIVATION: run after configure_event_emails.sql, frontend merge/deployment,
-- and the Resend webhook signing secret. Enables future service notifications.
begin;
do $$
begin
  if not exists(select 1 from private.email_config where worker_token_hash is not null)
    or to_regclass('cron.job') is null then
    raise exception 'Run configure_event_emails.sql before activation';
  end if;
  if not exists(select 1 from cron.job where jobname='event-emails-every-minute' and active) then
    raise exception 'The event email schedule is missing or inactive';
  end if;
end;
$$;
update private.email_config set enabled=true;

-- Existing confirmed attendees get future reminders, never old confirmation emails.
-- Skip events already within 24 hours to avoid an immediate reminder backlog.
insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
select m.id,r.user_id,r.email_registration_id,'reminder',m.email_revision,private.email_event(m),m.starts_at-interval '24 hours'
from public.meetups m join public.meetup_requests r on r.meetup_id=m.id and r.status='approved'
join private.member_access a on a.user_id=r.user_id and a.status='active'
join private.member_access h on h.user_id=m.host_id and h.status='active'
join auth.users u on u.id=r.user_id and u.email_confirmed_at is not null
where m.status='published' and m.starts_at>now()+interval '24 hours'
on conflict(meetup_id,user_id,registration_id,kind,revision) do nothing;

commit;
-- Emergency pause: update private.email_config set enabled=false;
