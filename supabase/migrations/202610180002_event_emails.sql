-- Stage F: transactional event email outbox. Apply once after public_profile_photos.
-- Delivery starts DISABLED. No historical confirmations are queued by this migration.
begin;
create table private.email_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  worker_token_hash text
);
insert into private.email_config default values;
create table private.email_suppressions (
  email_hash text primary key,
  reason text not null check (reason in ('bounced','complained')),
  created_at timestamptz not null default now()
);
alter table public.meetups add column email_revision bigint not null default 0;
alter table public.meetup_requests add column email_registration_id uuid not null default gen_random_uuid();
create table private.event_emails (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  registration_id uuid not null,
  kind text not null check (kind in ('confirmation','update','cancellation','reminder')),
  revision bigint not null,
  event jsonb not null,
  previous_event jsonb,
  due_at timestamptz not null,
  state text not null default 'queued' check (state in ('queued','processing','sent','cancelled','dead')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  lease_token uuid,
  leased_until timestamptz,
  first_attempt_at timestamptz,
  recipient_email text,
  request_payload jsonb,
  provider_id text unique,
  last_error text,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meetup_id,user_id,registration_id,kind,revision)
);
create index event_emails_due_idx on private.event_emails(due_at) where state in ('queued','processing');
create index event_emails_member_idx on private.event_emails(user_id,meetup_id);
create index event_emails_retention_idx on private.event_emails(updated_at) where state in ('sent','cancelled');
create function private.touch_event_email() returns trigger
language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end;
$$;
create trigger touch_event_email before update on private.event_emails
for each row execute function private.touch_event_email();
create table private.email_webhook_events (
  id text primary key,
  provider_id text not null,
  event_type text not null,
  created_at timestamptz not null default now()
);
alter table private.email_config enable row level security;
alter table private.email_suppressions enable row level security;
alter table private.event_emails enable row level security;
alter table private.email_webhook_events enable row level security;
revoke all on private.email_config,private.email_suppressions,private.event_emails,private.email_webhook_events from public,anon,authenticated;
grant all on private.email_config,private.email_suppressions,private.event_emails,private.email_webhook_events to service_role;

create function private.email_event(m public.meetups) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',m.id,'title',m.title,'starts_at',m.starts_at,
    'timezone',m.timezone,'place',m.place,'host',m.host_label,'status',m.status);
$$;
create function private.email_registration_generation() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then new.email_registration_id=gen_random_uuid();
  elsif new.status='approved' and old.status is distinct from 'approved' then
    new.email_registration_id=gen_random_uuid();
  else new.email_registration_id=old.email_registration_id; end if;
  return new;
end;
$$;
create trigger email_registration_generation before insert or update on public.meetup_requests
for each row execute function private.email_registration_generation();

create function private.email_event_revision() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Runs after guard_meetup has normalised local date/time into starts_at.
  new.email_revision=old.email_revision;
  if (new.starts_at,new.timezone,new.place,new.status) is distinct from
     (old.starts_at,old.timezone,old.place,old.status) then
    new.email_revision=old.email_revision+1;
  end if;
  return new;
end;
$$;
create trigger z_email_event_revision before update on public.meetups
for each row execute function private.email_event_revision();

create function private.queue_registration_emails() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetups;
begin
  if new.status='approved' and (tg_op='INSERT' or old.status is distinct from 'approved') then
    if not (select enabled from private.email_config) then return new; end if;
    select * into m from public.meetups where id=new.meetup_id;
    if m.status<>'published' or m.starts_at<=clock_timestamp() then return new; end if;
    insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
      values(m.id,new.user_id,new.email_registration_id,'confirmation',m.email_revision,private.email_event(m),now());
    -- Late RSVPs get a confirmation only, not a second immediate reminder.
    if m.starts_at>clock_timestamp()+interval '24 hours' then
      insert into private.event_emails(meetup_id,user_id,registration_id,kind,revision,event,due_at)
        values(m.id,new.user_id,new.email_registration_id,'reminder',m.email_revision,private.email_event(m),m.starts_at-interval '24 hours');
    end if;
  elsif new.status is distinct from 'approved' then
    update private.event_emails set state='cancelled',lease_token=null,leased_until=null
      where meetup_id=new.meetup_id and user_id=new.user_id and kind<>'cancellation' and state in ('queued','processing');
  end if;
  return new;
end;
$$;
create trigger queue_registration_emails after insert or update of status on public.meetup_requests
for each row execute function private.queue_registration_emails();

create function private.queue_event_emails() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.meetup_requests;
begin
  if new.email_revision=old.email_revision then return new; end if;
  -- Changing time/location or closing invalidates unsent versions, including leases.
  update private.event_emails set state='cancelled',lease_token=null,leased_until=null
    where meetup_id=new.id and kind<>'cancellation' and state in ('queued','processing');
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
create trigger queue_event_emails after update on public.meetups
for each row execute function private.queue_event_emails();

-- Built-in SHA256 works regardless of the pgcrypto installation schema.
create function public.authorize_email_worker(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select enabled and worker_token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    from private.email_config),false);
$$;

create function private.email_is_eligible(j private.event_emails) returns boolean
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

create function public.claim_event_email() returns jsonb
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
      lease_token=gen_random_uuid(),leased_until=now()+interval '2 minutes',
      first_attempt_at=coalesce(first_attempt_at,now()),recipient_email=coalesce(recipient_email,email)
      where id=j.id returning * into j;
    return jsonb_build_object('id',j.id,'lease_token',j.lease_token,'kind',j.kind,
      'event',j.event,'previous_event',j.previous_event,'email',j.recipient_email,'payload',j.request_payload,'attempts',j.attempts);
  end loop;
  return null;
end;
$$;

create function public.prepare_event_email(p_id uuid,p_lease uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.event_emails;
begin
  select * into j from private.event_emails where id=p_id for update;
  if j.state<>'processing' or j.lease_token is distinct from p_lease or j.leased_until<now()
    or not (select enabled from private.email_config) then return null; end if;
  if not private.email_is_eligible(j) then
    update private.event_emails set state='cancelled',last_error='no_longer_eligible',lease_token=null where id=p_id;
    return null;
  end if;
  if j.request_payload is null then
    if p_payload->'to'<>jsonb_build_array(j.recipient_email) or not (p_payload ?& array['from','to','subject','html','text','reply_to']) then
      raise exception 'Invalid event email payload';
    end if;
    update private.event_emails set request_payload=p_payload where id=p_id;
    return p_payload;
  end if;
  -- Freeze the complete provider request, including sender/template, across retries.
  return j.request_payload;
end;
$$;
create function public.finish_event_email(p_id uuid,p_lease uuid,p_provider_id text default null,
  p_error text default null,p_retry_seconds integer default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.event_emails set
    state=case when p_provider_id is not null then 'sent' when p_retry_seconds is null or attempts>=8 then 'dead' else 'queued' end,
    provider_id=p_provider_id,last_error=left(p_error,120),lease_token=null,leased_until=null,
    due_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_retry_seconds,60),3600)))
    where id=p_id and lease_token=p_lease and state='processing';
end;
$$;

create function public.record_event_email_delivery(p_webhook_id text,p_provider_id text,p_type text,p_at timestamptz,p_notification_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare j private.event_emails;
begin
  if p_type not in ('email.delivered','email.bounced','email.complained') then return; end if;
  -- Signed notification tag handles callbacks arriving before the worker acknowledgement.
  -- Deleted/expired jobs and unrelated provider mail are acknowledged without recreation.
  select * into j from private.event_emails where
    (id=p_notification_id or (p_notification_id is null and provider_id=p_provider_id)) for update;
  if not found or j.first_attempt_at is null or j.request_payload is null
    or (j.provider_id is not null and j.provider_id<>p_provider_id) then return; end if;
  insert into private.email_webhook_events(id,provider_id,event_type) values(p_webhook_id,p_provider_id,p_type) on conflict do nothing;
  if not found then return; end if;
  update private.event_emails set
    provider_id=p_provider_id,state='sent',lease_token=null,leased_until=null,
    delivered_at=case when p_type='email.delivered' then coalesce(delivered_at,p_at) else delivered_at end,
    bounced_at=case when p_type='email.bounced' then coalesce(bounced_at,p_at) else bounced_at end,
    complained_at=case when p_type='email.complained' then coalesce(complained_at,p_at) else complained_at end
    where id=j.id;
  if p_type in ('email.bounced','email.complained') then
    insert into private.email_suppressions(email_hash,reason)
      values(encode(sha256(convert_to(lower(j.recipient_email),'UTF8')),'hex'),substring(p_type from 7))
      on conflict(email_hash) do update set reason=excluded.reason;
    update private.event_emails set state='cancelled',lease_token=null,last_error='recipient_suppressed'
      where recipient_email=j.recipient_email and state in ('queued','processing');
  end if;
end;
$$;
revoke all on function public.authorize_email_worker(text),public.claim_event_email(),
 public.prepare_event_email(uuid,uuid,jsonb),public.finish_event_email(uuid,uuid,text,text,integer),
 public.record_event_email_delivery(text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.authorize_email_worker(text),public.claim_event_email(),
 public.prepare_event_email(uuid,uuid,jsonb),public.finish_event_email(uuid,uuid,text,text,integer),
 public.record_event_email_delivery(text,text,text,timestamptz,uuid) to service_role;
notify pgrst,'reload schema';
commit;
