begin;

-- Custom names remain in the existing private profile array, never the shared catalog.
create function private.prepare_profile_interests() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  value text;
  cleaned text;
  canonical text;
  names text[] := '{}';
begin
  if new.interests is null or coalesce(array_ndims(new.interests), 1) <> 1 then
    raise exception 'Interests must be a list' using errcode = '22023';
  end if;
  foreach value in array new.interests loop
    cleaned := regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    select i.name into canonical from public.interests i where lower(i.name) = lower(cleaned);
    -- Catalog names may include longer migrated legacy choices; keep those usable.
    if cleaned is null or cleaned = '' or (canonical is null and
      (char_length(cleaned) > 60 or cleaned ~ '[[:cntrl:],]')) then
      raise exception 'Each interest must contain 1 to 60 plain text characters without commas' using errcode = '22023';
    end if;
    if not exists (select 1 from unnest(names) n where lower(n) = lower(cleaned)) then
      names := array_append(names, coalesce(canonical, cleaned));
    end if;
  end loop;
  if cardinality(names) > 12 then
    raise exception 'Choose up to 12 interests' using errcode = '22023';
  end if;
  new.interests := names;
  return new;
end;
$$;
revoke all on function private.prepare_profile_interests() from public, anon, authenticated;

create trigger prepare_profile_interests before insert or update of interests on public.profiles
for each row execute function private.prepare_profile_interests();

-- Keep normalized links for catalog choices only. Existing RLS and grants are unchanged.
create or replace function private.sync_profile_interests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_interests where member_id = new.id;
  insert into public.member_interests (member_id, interest_id)
    select distinct new.id, i.id from unnest(new.interests) v
      join public.interests i on lower(i.name) = lower(v);
  return new;
end;
$$;

commit;
