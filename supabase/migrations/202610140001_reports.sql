-- Run AFTER 202610130001_init.sql. Private, write-only community reports.
create table public.reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.profiles(id) on delete cascade,
 meetup_id uuid not null references public.meetups(id) on delete cascade,
 category text not null check (category in ('Safety','Harassment','Spam','Other')),
 details text not null check (char_length(details) between 10 and 1000),
 created_at timestamptz not null default now()
);
create index reports_meetup_idx on public.reports(meetup_id);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant insert on public.reports to authenticated;
create policy reports_create_own on public.reports for insert to authenticated
 with check ((select auth.uid())=reporter_id);
-- No member SELECT/UPDATE/DELETE policy: reports are private.
-- Founder review requires a separate protected server-side admin tool;
-- never expose the service_role key in browser code.
