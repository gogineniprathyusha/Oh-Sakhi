# Stage F — event email notifications

The app uses Supabase PostgreSQL to queue committed RSVP/event changes and a protected Edge Function to send each message through Resend. GoDaddy DNS is already verified for `alerts.herhobbyhour.com`; website DNS does not change. Supabase Auth confirmation/reset SMTP is a separate feature.

## Initial preparation, before activation

For project `znuzfxbedoyuqpksvbcr`, migrations `202610170010_flexible_group_size.sql`, `202610180001_public_profile_photos.sql` and `202610180002_event_emails.sql` have been applied successfully. **Do not run them again in this project.** The `event-emails` and `email-webhook` functions are deployed. Hosted verification found delivery disabled, zero queue rows and no guest/member execute access to worker RPCs. The owner created the Resend webhook and saved its signing secret. The deployed worker rejects unauthenticated requests (401), and the configured webhook rejects unsigned requests (401). The cron/Vault configuration script has also been applied: both named schedules exist, the dedicated credential matches its stored hash, and delivery remains disabled with zero email records. The separate activation script was verified inside a transaction that rolled back; it did not enable delivery or persist reminder jobs. These checks do not yet prove signed provider delivery. No automatic notification email was sent during preparation. Frontend changes remain on `feature/event-email-notifications`; frontend merge, delivery activation and live automatic-workflow checks are still pending. The generic setup sequence below remains applicable to other installations and outstanding steps only.

## Attendee delivery activated on October 18, 2026

After PR #12 was merged to main (`245ed97`), the production event-link bundle and CI were verified and the activation script was applied. RSVP confirmation, event update, reminder and cancellation each ran through the actual minute-based worker and signed delivery webhook. The owner confirmed all four reached the test inbox. The reminder used only the labelled test job's advanced due time. The test event was cancelled with its RSVP history preserved, zero occupied seats and no queued test work. Attendee email delivery remains enabled; the initial preparation snapshot above describes the earlier disabled state.

## Messages and recipients

| Message           | Trigger                                                      | Recipient                                      |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| RSVP confirmation | A member successfully reserves or re-reserves a seat         | That confirmed attendee                        |
| Event update      | A published event's start instant, timezone or venue changes | Current confirmed attendees                    |
| Cancellation      | Organiser cancels, or admin removes, a published event       | Attendees confirmed immediately before closure |
| Reminder          | Approximately 24 hours before the event                      | Still-confirmed attendees                      |
| Event published   | Publish a new event or republish a draft                     | The organiser                                  |
| New attendee      | A member reserves or re-reserves a seat                      | The organiser; attendee display name only      |

Description/title/cover/capacity edits do not trigger schedule emails. Attendee messages do not go to guests, organisers without an attendee RSVP, withdrawn attendees or pending/declined requests. Organiser publication and new-attendee messages use the separate rules below. A late RSVP inside 24 hours receives a confirmation without a second immediate reminder. Existing confirmed future RSVPs receive scheduled reminders on activation, without historical confirmation emails. Each email has one `to` address; attendee addresses are never exposed to organisers or other attendees.

RSVP success is independent of Resend availability: the action and queue rows commit atomically, with no HTTP call in a trigger. The worker checks the current registration generation, event revision/status, active member/host access, confirmed Auth email and bounce suppression immediately before sending. Withdrawal, closure and rescheduling invalidate queued/leased messages. An email already accepted or in flight cannot be recalled; later changes send the appropriate new update/cancellation. Changed Auth email cancels jobs addressed to the previous address.

## Activation, in order

1. Merge/deploy the frontend changes first so `https://www.herhobbyhour.com/?event=UUID` opens the corresponding authorised event. Removed/unavailable events route a member to My plans with a clear explanation. Guest-only links never bypass RLS; sign-in restores access to eligible past/cancelled plans.
2. In Supabase SQL Editor, apply **only** the new `supabase/migrations/202610180002_event_emails.sql`, after all earlier migrations. It adds the queue and RPCs but starts with delivery **disabled**. Existing event/registration rows remain intact. Do not rerun historical migrations. Existing manual installations should also have applied `202610170010_flexible_group_size.sql` and `202610180001_public_profile_photos.sql`.
3. Confirm these server secrets under Supabase → Edge Functions → Secrets (already saved and sender-tested for this project):

   | Secret           | Value                                                           |
   | ---------------- | --------------------------------------------------------------- |
   | `RESEND_API_KEY` | Private Resend sending-access key for `alerts.herhobbyhour.com` |
   | `EMAIL_FROM`     | `Her Hobby Hour <events@alerts.herhobbyhour.com>`               |
   | `EMAIL_REPLY_TO` | `whiteperall@gmail.com`                                         |
   | `APP_BASE_URL`   | `https://www.herhobbyhour.com`                                  |

   No `VITE_` variable, frontend key, Vercel secret or GoDaddy change is needed for event emails. Do not put the Resend key in chat, Git or the frontend environment. The sender display name can be changed, but freeze already-attempted payloads during retries.

4. Deploy the two new functions (these commands do not deploy unrelated functions):

   ```sh
   npx --yes supabase functions deploy event-emails --project-ref znuzfxbedoyuqpksvbcr --use-api
   npx --yes supabase functions deploy email-webhook --project-ref znuzfxbedoyuqpksvbcr --use-api
   ```

   `verify_jwt=false` is intentional for both functions: `event-emails` verifies a dedicated random worker token against its private database hash through a service-only RPC; `email-webhook` verifies the raw-body Svix signature and timestamp. They do not accept an ordinary browser session or publishable key as authorization. Never remove the application checks.

5. In **Resend → Webhooks → Add Webhook**, enter:

   ```text
   https://znuzfxbedoyuqpksvbcr.supabase.co/functions/v1/email-webhook
   ```

   Select **`email.delivered`**, **`email.bounced`** and **`email.complained`**. Save the endpoint, copy its signing secret (`whsec_…`), and save that as **`RESEND_WEBHOOK_SECRET`** under **Supabase → Edge Functions → Secrets**. This is a new webhook secret, separate from `RESEND_API_KEY`; do not paste it into chat. Other Resend messages, including onboarding tests/Auth SMTP, are ignored because they lack the signed event-email tags. No open/click tracking is needed. See [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests).

6. Run **`supabase/setup/configure_event_emails.sql`** in the Supabase SQL Editor to prepare scheduling while delivery stays **disabled**. This hosted setup script enables `pg_cron`, `pg_net` and Vault, generates a dedicated worker credential inside Vault, stores its SHA256 hash in the private configuration, creates one minute-based job, and schedules daily retention cleanup. **The token never needs to be copied or shared.** Running it again replaces the named cron schedules and pauses delivery. For another project, change the project URL stored as `event_email_project_url`; existing Vault values are retained deliberately.
7. After the frontend is deployed and webhook setup is complete, run **`supabase/setup/enable_event_emails.sql`** to activate delivery and schedule future reminders for existing confirmed attendees. It verifies the schedule/credential exist and avoids duplicate reminder jobs. This is a separate rollout action, not a historical migration.
8. Verify the two cron jobs exist and run successfully, then use two owned test accounts for a labelled event: RSVP → confirmation, change venue/time → update, cancel → cancellation. Test a due reminder in a dedicated staging project using trusted SQL to advance only that labelled test job; do not change unrelated events or wait for a real member's reminder. Confirm inbox receipt and a recorded `delivered_at`. Do not mark a real email as spam to test suppression; signed fixtures cover that logic.

The minute job processes up to 20 due messages per invocation, with provider pacing and a time budget. Normally mail is submitted during the next minute; backlog, outages or provider limits can delay it. Monitor queue size and the current Resend account quota before increasing throughput. Scheduling runs on Supabase, without an open browser or Vercel server process. See [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions).

## Organiser notifications

Hosted rollout verified on October 18, 2026: the new migration was applied once, the expanded `event-emails` worker deployed, and `enable_organiser_emails.sql` applied. Both `enabled` and `organiser_enabled` are true. A labelled event generated exactly one publication message despite repeated publication calls, then one organiser join notice and one attendee confirmation despite repeated RSVP calls. Cancellation generated the attendee cancellation only. All four were delivered on their first attempts, recorded through signed webhooks, and confirmed in the two owned inboxes. Recipient assertions verified the organiser received only the attendee display name, without their contact email. The test event is cancelled with zero occupied seats, retained history and no pending test work. No new DNS, sender secret or webhook configuration was needed.

`202610180003_organiser_emails.sql` adds a separately staged `organiser_enabled` switch; applying it leaves organiser notifications disabled and preserves the existing global delivery setting and queued attendee jobs. It adds two kinds to the same private queue, so sender credentials, webhook settings, retries, suppression, leases and retention are reused. No DNS change, new secret or additional Edge Function is required.

- A newly published event or a draft becoming published queues one **Your event is published** message to its organiser. Saving a draft, ordinary edits or repeated publication of an already-published event do not resend it. Republish after returning to draft is a new publication transition and gets a new confirmation.
- A new confirmed RSVP queues one **Someone joined your event** message to the organiser, in addition to the member's existing confirmation. Repeated RSVP calls do not resend; withdrawal and re-reservation represent a new registration and produce a new notice. The email includes only the attendee's display name, which the organiser can already view in the attendee list. No attendee email address is shared.
- Withdrawal, account deletion, closed/draft/removed events, inactive hosts/attendees or suppression prevent pending organiser messages from sending. Deleted members cascade related queued notification data. Date/venue edits keep pending join/publication notices, and their event details refresh before first send; previously attempted provider payloads stay frozen for duplicate protection. An in-flight email cannot be recalled.
- Both messages link to the existing event detail page; signing in as its organiser exposes management/attendee controls. Organisers receive no attendee-style “cancel your RSVP” instruction.

Rollout: apply the new migration once, deploy the updated `event-emails` function, and then run `supabase/setup/enable_organiser_emails.sql`. Deploy the updated worker **before enabling** the new message kinds. Existing publications/joins are not backfilled. Pause just these two types with `update private.email_config set organiser_enabled=false;`; this does not pause attendee delivery. On a fresh installation, enable base event email delivery before running the organiser activation script. Merge the accompanying privacy-page clarification with the app changes.

## Reliability and private records

Only `service_role` can invoke the worker/delivery RPCs. The queue, delivery records, token hash and suppression hashes are in unexposed `private` tables with RLS and no browser grants. Auth email is resolved server-side; recipient/subject/body cannot be supplied by the HTTP caller. Event snapshots include public event details and, for organiser join notices, the attendee display name; they exclude profile bios, email lists and moderation reasons. Deleted users/events cascade their queue rows. Terminal sent/cancelled records and webhook IDs are removed after 30 days; unresolved dead jobs remain for operator review. Suppression stores hashes of addresses to avoid repeat sending after a permanent bounce or spam complaint.

Workers claim jobs using `FOR UPDATE SKIP LOCKED`, unique per-attempt leases and a two-minute expiry. Concurrent workers cannot claim the same active lease. Templates and full provider request bodies are persisted before the first HTTP request. Retries use the same `event-email/JOB_UUID` idempotency key and frozen body, even if configuration/templates changed. Transient network/429/5xx failures back off with at most eight attempts. Old attempt acknowledgements cannot replace a newer lease. Delivery webhooks deduplicate signed message IDs, handle early callbacks, and suppress hard-bouncing/complaining recipients. HTML is escaped; event labels use their actual timezone and EDT/EST offset.

Resend retains idempotency keys for 24 hours. After 23 hours from a first attempt, an ambiguous job is marked `dead` for review instead of risking a duplicate send. Exactly-once inbox delivery cannot be guaranteed across independent services. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Operator checks and pause

Run in Supabase SQL Editor as the project operator, not from a browser client:

```sql
select enabled from private.email_config;
select jobname, schedule, active from cron.job
where jobname in ('event-emails-every-minute','event-email-retention');
select state, kind, count(*) from private.event_emails group by state,kind;
select id,kind,state,attempts,last_error,provider_id,delivered_at,bounced_at,complained_at
from private.event_emails order by created_at desc limit 30;
select jobid,status,return_message,start_time from cron.job_run_details
order by start_time desc limit 10;
```

Check Resend delivery logs and Supabase function logs as well: a successful cron HTTP enqueue does not itself prove provider delivery. Avoid printing secrets, raw request payloads or recipient addresses in logs.

Pause immediately:

```sql
update private.email_config set enabled=false;
```

This stops new queue inserts and worker claims; in-flight provider requests may finish. Diagnose/update credentials, then deliberately decide whether still-eligible queued work should resume. To discard a stale backlog, mark `queued`/`processing` rows `cancelled` before reactivation. Do not reset a `dead` ambiguous job to `queued` or generate a new idempotency key blindly: check Resend first. Remove a suppression hash only after resolving the bounce/complaint and obtaining the recipient's agreement. Auth SMTP and Stage G marketing/preferences remain separate.

## Verification scope

`npm run check`, `npm test`, `npm run test:db`, `npm run check:functions`, email-link browser checks and `npm run build` cover code, pinned Edge imports, real PostgreSQL migration upgrades/RLS/queues/leases/cancellation/suppression, HMAC tamper/replay rejection and browser event navigation. Local tests use fixtures, no Resend key or real email. Hosted cron/Vault/provider delivery must be verified after activation; these local checks do not claim those services are configured. The earlier single-email sender test reached the owner's inbox; it was not an automatic RSVP workflow test.
