# Instant RSVPs

> Update: browser demo mode has been removed. Signed-out visitors now browse published Supabase events and sign in for account actions. Demo references below describe earlier-stage behavior and verification.


This change supersedes organiser approval of attendance. Events still publish immediately, organisers edit/cancel their own events, and administrators retain violation-removal access.

## Current behavior

- **RSVP** reserves and confirms a seat immediately when the member is active, the event is published, its organiser is active, registration is open and capacity remains.
- Repeated submissions return the same confirmed RSVP and consume no additional seats. Members cannot RSVP to their own hosted event.
- **Cancel my spot** releases the seat immediately. The member can RSVP again while eligible. An old declined request does not require an organiser decision to rejoin under the new rules.
- Organisers use **View attendees** for a read-only list of confirmed/non-attending members. There are no approval, decline, reconsideration or revocation controls. They still cancel the event directly from details.
- My plans shows confirmed attendance, hosting and cancelled history. Demo RSVP behavior matches the real workflow, while remaining browser-only.

No waitlist, notifications or automatic emails are added.

## Database and upgrade

Apply `supabase/migrations/202610170006_instant_rsvps.sql`, then `202610170007_rsvp_counter_fix.sql`, once each after the previous seven migrations. Earlier SQL files remain unchanged. No Edge Function redeployment or new browser environment variable is required.

The existing RPC name `request_meetup` is retained to preserve the API structure; it now returns a confirmed reservation immediately. The stored status remains `approved` and the counter remains `approved_count` for compatibility with existing constraints, views and triggers. These names no longer indicate an organiser decision. The UI calls the state **Confirmed**. The old `decide_meetup_request` function remains in historical schema definitions, but execution is revoked from browser/service roles.

The transaction locks the event row before checking capacity and inserting/updating the member's registration. Insert and update paths are separate: a conflict upsert would run both BEFORE INSERT and BEFORE UPDATE counter triggers when a member rejoins. The follow-up migration fixes that path and reconciles only mismatched counters to the actual confirmed registrations. Existing counter triggers and the capacity CHECK remain active. Instant RSVPs, withdrawal, event cancellation, removal and capacity edits use the same event lock. Direct registration writes remain denied by grants and RLS.

The migration preserves every existing confirmed seat, declined/cancelled record and history row. Legacy pending requests for future published events with active members/hosts are confirmed in submission order while capacity remains. The remaining pending requests become cancelled history; they do not become a waitlist or consume seats. Existing requests submitted before a deadline can still be converted before the event starts. Members can attempt a fresh RSVP later while registration is open. The migration briefly takes table locks so the conversion and RPC replacement happen atomically.

Existing browser demo storage is converted locally using the same within-capacity principle. Nothing from demo storage is uploaded.

For another existing development project, run only the two new migrations through the SQL Editor or the authenticated CLI:

```bash
npx --yes supabase db query --project-ref YOUR_DEVELOPMENT_PROJECT_REF --linked --file supabase/migrations/202610170006_instant_rsvps.sql
npx --yes supabase db query --project-ref YOUR_DEVELOPMENT_PROJECT_REF --linked --file supabase/migrations/202610170007_rsvp_counter_fix.sql
```

## Verification

The full 46-browser suite passed, including instant confirmation, attendee visibility, withdrawal, rejoining, event cancellation, desktop/mobile behavior and the original-preview comparisons. All 23 unit checks, strict TypeScript, lint and the production build passed. All 40 real PostgreSQL checks passed, covering safe legacy conversion, preserved seats/history, duplicate idempotency, retired approval access, deadline/access boundaries, competing RSVPs for the last seat, capacity edits racing RSVPs and cancellation racing RSVPs. Earlier approval tests still verify historical migration behavior before the new migration is applied.

Both migrations have already been applied to the connected development project; do not rerun them there. The initial hosted rollback-only check exposed the rejoin counter issue; it was reproduced in disposable PostgreSQL and corrected by the follow-up migration. The final authenticated-role database check passed immediate confirmation, duplicate submission, withdrawal, rejoining with exactly one reserved seat, retired approval access and event cancellation. All test writes were rolled back. The original four registration rows remain, with one confirmed, zero pending and zero counter mismatches; browser access to the approval function is disabled.

The production preview also passed a demo RSVP/cancellation smoke check without page errors. Browser service fixtures test application behavior rather than hosted Auth delivery; this update does not send emails or require access to an account password.
