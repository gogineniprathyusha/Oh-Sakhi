-- Run after organiser_emails migration and deploying the updated event-emails worker.
-- Does not replay historical publications or existing attendee joins.
begin;
do $$
begin
  if not exists(select 1 from private.email_config where enabled and worker_token_hash is not null) then
    raise exception 'Configure and enable event email delivery before organiser notifications';
  end if;
end;
$$;
update private.email_config set organiser_enabled=true;
commit;
-- Pause organiser notifications only:
-- update private.email_config set organiser_enabled=false;
