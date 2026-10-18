-- Hosts choose any positive whole-number capacity within PostgreSQL's integer range.
-- Existing events and registrations are preserved; seat counters and locks stay enforced.
begin;

alter table public.meetups
  drop constraint meetups_capacity_check,
  add constraint meetups_capacity_check check (capacity > 0);

commit;
