-- Run once the RSVP cancellation migration and expanded worker are deployed.
-- Does not replay earlier withdrawals. Independent of organiser delivery switches.
begin;
do $$
begin
  if not exists(select 1 from private.email_config where enabled and worker_token_hash is not null) then
    raise exception 'Configure and enable event email delivery first';
  end if;
end;
$$;
update private.email_config set rsvp_cancellation_enabled=true;
commit;
-- Pause only these member confirmations:
-- update private.email_config set rsvp_cancellation_enabled=false;
