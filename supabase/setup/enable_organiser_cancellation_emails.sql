-- Run after organiser_cancellation_emails migration and the expanded worker deployment.
-- Does not replay earlier cancellations.
begin;
do $$
begin
  if not exists(select 1 from private.email_config where enabled and organiser_enabled and worker_token_hash is not null) then
    raise exception 'Configure and enable event and organiser email delivery first';
  end if;
end;
$$;
update private.email_config set organiser_cancellation_enabled=true;
commit;
-- Pause only organiser cancellation confirmations:
-- update private.email_config set organiser_cancellation_enabled=false;
