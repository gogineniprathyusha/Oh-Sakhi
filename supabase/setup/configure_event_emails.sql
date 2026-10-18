-- HOSTED PREPARATION. Run after the migration and Edge Function deployments.
-- This configures credentials/schedules but leaves delivery DISABLED.
-- Edit only project_url below when using a different Supabase project.
-- Not a migration: requires hosted pg_cron, pg_net and Vault extensions.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare token text; token_id uuid; url_id uuid;
begin
  -- Keep a dedicated random credential in Vault, never a service-role key in cron.
  select id,decrypted_secret into token_id,token from vault.decrypted_secrets where name='event_email_worker_token';
  if token_id is null then
    token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    perform vault.create_secret(token,'event_email_worker_token','Dedicated event email worker credential');
  end if;
  select id into url_id from vault.decrypted_secrets where name='event_email_project_url';
  if url_id is null then
    perform vault.create_secret('https://znuzfxbedoyuqpksvbcr.supabase.co','event_email_project_url');
  end if;
  update private.email_config set worker_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),enabled=false;
end;
$$;

-- Replace an existing job with this name rather than creating duplicate schedules.
select cron.unschedule(jobid) from cron.job where jobname='event-emails-every-minute';
select cron.schedule('event-emails-every-minute','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='event_email_project_url')||'/functions/v1/event-emails',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='event_email_worker_token')),
    body := '{}'::jsonb,timeout_milliseconds := 55000
  ) where (select enabled from private.email_config);
$job$);
select cron.unschedule(jobid) from cron.job where jobname='event-email-retention';
select cron.schedule('event-email-retention','15 8 * * *',$job$
  delete from private.event_emails where state in ('sent','cancelled') and updated_at<now()-interval '30 days';
  delete from private.email_webhook_events where created_at<now()-interval '30 days';
$job$);
commit;
-- After frontend deployment and webhook setup, run enable_event_emails.sql.
