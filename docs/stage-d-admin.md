# Stage D — Administration and moderation

> Update: browser demo mode has been removed. Signed-out visitors now browse published Supabase events and sign in for account actions. Demo references below describe earlier-stage behavior and verification.


Stage D preserves the existing cream/plum design, Vite/React/TypeScript frontend, Supabase integration and immediate publication/RSVP rules. Event emails are deferred to Stage F.

## Features

- **Admin navigation:** visible only after the authenticated access lookup identifies an active administrator. The dashboard is lazy-loaded. Browser visibility is a convenience; every privileged database operation independently checks the current member and trusted administrator tables.
- **Overview:** total/active/suspended members, future published events from active organisers, drafts, confirmed RSVPs across all events, and open/reviewing reports.
- **Reports:** status filters, event-title/report-ID search, reporter display name, private details, review notes, reviewer/time, review/resolve/dismiss/reopen actions and access to the reported event. Closing a report does not implicitly remove its event. Removal does not implicitly close reports.
- **Members:** display-name/member-ID search, status filters, stable pagination and reasoned suspension/restoration. No email addresses or sensitive profile content are exposed. There is no browser role-assignment control.
- **Events:** all status filters including drafts and removed events, organiser status, confirmed seat totals, details, attendees, CSV exports and removal for a violation. Ordinary organisers retain publication, editing and cancellation control. Administrators do not approve RSVPs.
- **History:** paginated audit records for access changes, report reviews, event removal/status changes and exports. Historical records may have fewer details than new decisions.
- **Attendee CSV:** available to an event's active organiser or an active administrator. The export is fetched through an authorised, audited RPC each time. Confirmed-only is the default; all-status history is an explicit choice. Columns are member ID, display name, RSVP state and registration time in UTC. UTF-8, commas, quotes, newlines and spreadsheet formula prefixes are handled. Exports contain no email addresses. Successful export retrieval is audited, not proof that the browser saved a file or a person opened it.

## Access and moderation rules

Member access changes need a reason (10–500 trimmed characters). Suspension blocks member operations even with an existing session and hides the member's hosted events from public discovery. Existing registrations, seat reservations and history remain intact. An administrator should separately remove violating events if their RSVPs must be cancelled. Restoring access makes eligible published events discoverable again. Dashboard actions cannot change an administrator's access; use the trusted SQL workflow for administrator role/access changes.

Reports support open, reviewing, resolved and dismissed states. Resolution/dismissal needs a note of 10–1000 trimmed characters. The UI requests a note for all reviews. Each review records the actor, time, previous/new state and note. Concurrent reviews serialize on the report row; the most recently saved review is the current state, with earlier reviews retained in history.

Event removal needs a reason (10–1000 trimmed characters) and explicit confirmation. Existing `moderate_meetup` logic marks the event removed, cancels active RSVPs, releases seats and retains event/report/registration/audit records. It does not grant admins organiser publication or RSVP-decision powers.

## Database setup

Apply `supabase/migrations/202610170008_admin_dashboard.sql` once after the preceding nine migrations. Earlier migrations are unchanged. The transaction adds supporting indexes and bounded administrator list/export functions, extends statistics and strengthens the existing review/access APIs. No rows or existing roles are removed, and no Edge Function or email-provider changes are required.

For another development project:

```bash
npx --yes supabase db query --project-ref YOUR_DEVELOPMENT_PROJECT_REF --linked --file supabase/migrations/202610170008_admin_dashboard.sql
```

The first administrator must already have signed up and confirmed their email. Assign the role through the trusted SQL Editor, using your selected account:

```sql
insert into private.admin_roles(user_id)
select u.id from auth.users u
join private.member_access a on a.user_id=u.id
where lower(u.email)=lower('YOUR_ADMIN_EMAIL')
  and u.email_confirmed_at is not null and a.status='active'
on conflict(user_id) do nothing;
```

Check that exactly the intended account matched. Do not enable the private schema in the API, expose server credentials, or trust signup role metadata. Use **Refresh plans** or sign in again to load the updated access flag and reveal **Admin**. The API never accepts a client-supplied administrator flag.

## Verification

All **54 Chrome browser tests**, **47 real PostgreSQL checks**, **26 unit tests**, strict TypeScript, ESLint and the production build passed. The final eight administrator browser scenarios were rerun after the last copy/loading improvements. Coverage includes report review/reopening, pagination/search, failed-action retries, access changes, role revocation, removal/cancellation/history, authorised CSV downloads, spreadsheet formula handling, export rate limits, ordinary-member/anonymous/suspended denials and mobile layout. Desktop/mobile screenshots were reviewed; the original preview comparisons still pass. The production preview returned HTTP 200 with all six demo events, no admin navigation for guests and zero page errors.

`202610170008_admin_dashboard.sql` has already been applied once to the connected development project. Do not rerun it there. The project owner's selected, confirmed account was assigned the initial administrator role through trusted SQL and the assignment was audited. Refresh member data or sign in again to reveal Admin.

A hosted authenticated-role transaction passed administrator lists/statistics, report review, suspension/restoration, member denial, audited export and violation removal with released seats. Every test write was rolled back. Final integrity reads preserved two profiles, four events, four registrations, fifteen registration-history rows, zero reports and zero suspended members, with zero seat-counter mismatches. The single permanent role assignment remains, as requested.

Browser tests use intercepted Supabase responses; real database tests use disposable local PostgreSQL with Auth/Storage interfaces represented by fixtures. No test creates a real member account or sends email. Hosted SQL role checks are distinct from a live browser sign-in test; this stage did not access the owner's password or perform a new hosted browser sign-in.

## Remaining stages

- **E:** legal/contact pages, account deletion, accessibility/security/mobile checks and production configuration/deployment preparation. Public launch requires approval.
- **F:** RSVP confirmation, date/time/venue update, cancellation and approximately 24-hour reminder emails, with reliable server delivery.
- **G:** waitlists, improved filtering/discovery, interest matching, announcements/preferences and feedback-led improvements.
