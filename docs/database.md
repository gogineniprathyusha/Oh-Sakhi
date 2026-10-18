# Database foundation and organiser workflow

The database remains Supabase PostgreSQL with `profiles`, `meetups` and `meetup_requests`. Existing names, profile signup triggers, report data and registrations are retained. Authentication belongs to Supabase Auth; passwords are never stored in application tables.

## Migration history

Apply files in filename order, once each. Do not edit migrations that have already been applied.

| Migration                                          | Purpose                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `202610130001_init.sql`                            | Original profiles, meetups and requests                                                                           |
| `202610140001_reports.sql`                         | Private event reports                                                                                             |
| `202610170001_foundation.sql`                      | Secure admin assignments/access, interests, event timing/status, counters and history                             |
| `202610170002_authorization_and_registrations.sql` | Private profiles, safe event directory, transactional registration APIs and controlled grants                     |
| `202610170003_storage.sql`                         | Private photo/cover buckets and owned immutable paths                                                             |
| `202610170004_organizer_workflow.sql`              | Immediate organiser publication, persistent publication after edits, organiser-only seat decisions, admin removal |
| `202610170005_event_images.sql`                    | Service-only cover commits and restrictions that require server image validation                                  |
| `202610170006_instant_rsvps.sql`                   | Immediate member reservations, retired approval API and safe legacy queue conversion                              |
| `202610170007_rsvp_counter_fix.sql`                | Separate insert/update reservation paths and reconcile mismatched counters                                        |
| `202610170008_admin_dashboard.sql`                 | Bounded administrator reads, recorded report/access decisions, audit access and authorised attendee exports       |
| `202610170009_account_deletion.sql`                | Own-account summary, server-only deletion preparation/file listing and protected pending access                   |
| `202610170010_flexible_group_size.sql`              | Positive whole-number group sizes without the original 30-seat limit; existing capacity enforcement is retained     |

The historical foundation required administrator publication. **The organiser-workflow migration replaces that policy.** Apply all twelve files for the current application and deploy `event-image` for covers and `delete-account` for account deletion. The frontend reads `meetup_directory` and uses registration RPCs; it does not write registration rows directly. Existing manual SQL Editor installations should apply only outstanding files. Apply `202610170010_flexible_group_size.sql` before entering group sizes above 30 or below 2. Group sizes must be positive integers within PostgreSQL's integer range (1–2,147,483,647), and cannot be reduced below the confirmed attendee count.

The first foundation migration classifies legacy events as drafts because they previously had no publication status. Their registrations are preserved. The organiser-workflow migration keeps those drafts private to avoid unexpectedly publishing unfinished content. Their organiser can publish them directly, with no admin review. Newly created events default to `published`.

## Data and visibility

- `profiles`: own profile by default, plus admin access for moderation. Safe writable columns only; signup metadata cannot assign admin roles or access status.
- `interests` / `member_interests`: supported interest catalogue and private member associations. Existing custom interests are retained when migrating.
- `meetups`: immutable owner/identity, status, Richmond timezone, canonical `starts_at`, optional `ends_at`, registration deadline, cover path, public `host_label`, approved counter and `details_updated_at`.
- `meetup_directory`: security-invoker view applying event RLS. It exposes an explicit event host label rather than joining private member profiles. Includes the details-change timestamp.
- `meetup_requests`: one row per member/event. `pending`, `approved`, `declined` or `cancelled`.
- `registration_history`: records registration transitions without deleting the old state. Members see their own records; organisers/admins have authorised access.
- `reports`: private member reports with review status/actor metadata.
- `private.admin_roles`, `member_access`, `admin_audit_log`, `rate_limits`: trusted role/access assignment, moderation trace and action limits. They are not writable by browser users.

Guests can read published events from active organisers, not private profiles or attendee lists. Active organisers see their own drafts and closed/removed events. Prior participants can view their non-removed event history. Removed events are hidden from ordinary browsing, including former participants; their own registration history is retained. Suspended accounts cannot perform member actions.

## Final permission model

Members create events under their own account. Organisers publish or save drafts directly, edit their own active events, view attendees and cancel events. Edits to title, time, location, description, capacity or imagery keep publication and registrations intact and mark `details_updated_at`. Attendees see a details-changed notice; automated notifications are not implemented.

Members RSVP through `request_meetup` and receive a confirmed seat immediately, within capacity and before the registration deadline/start. The organiser and administrators do not approve or decline attendance. Members cancel their own RSVP and may reserve again when eligible. The old decision RPC is retained for migration history but execution by browser roles is revoked. See [instant-rsvps.md](instant-rsvps.md) for legacy status handling.

Administrators can remove violations after publication, with a required reason. This sets `removed`, cancels outstanding requests/approved seats and writes an audit record. The event and registration history remain stored. Organisers cannot undo removal. Closed events cannot be reopened. Browser roles cannot hard-delete events. Administrator event-field access retained for moderation does not confer attendance-decision rights.

Capacity is protected by transactions, locks on the event row, a maintained approved counter and a database CHECK. Instant RSVPs, capacity edits, cancellation and removal serialize against the same row. Direct registration writes, self-approval and ownership changes are denied.

## Browser API contract

Use the current authenticated session. Arguments are named exactly as shown:

| API                       | Arguments                                      | Access                                                            |
| ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `request_meetup`          | `p_meetup_id`                                  | Active member, immediate confirmed seat before deadline/start     |
| `withdraw_meetup_request` | `p_meetup_id`                                  | Own confirmed RSVP                                                |
| `set_meetup_status`       | `p_meetup_id`, `p_status`                      | Event organiser; draft/published/cancelled/completed transitions  |
| `moderate_meetup`         | `p_meetup_id`, `p_reason` (10–1000 characters) | Active administrator                                              |
| `get_meetup_attendees`    | `p_meetup_id`                                  | Organiser/admin; minimal display name and request state           |
| `get_my_access`           | None                                           | Current member’s status and trusted admin flag                    |
| `set_member_interests`    | `p_interest_ids`                               | Current active member                                             |
| `set_member_access`       | `p_user_id`, `p_status`, `p_reason`            | Administrator                                                     |
| `review_report`           | `p_report_id`, `p_status`, `p_note`            | Administrator                                                     |
| `admin_statistics`        | None                                           | Administrator                                                     |
| `admin_list_members`      | `p_status`, `p_search`, `p_offset`, `p_limit`  | Active administrator; names, IDs, city, role/access and reasons   |
| `admin_list_reports`      | `p_status`, `p_search`, `p_offset`, `p_limit`  | Active administrator; private reports and review state            |
| `admin_list_events`       | `p_status`, `p_search`, `p_offset`, `p_limit`  | Active administrator; event status, organiser access and capacity |
| `admin_list_audit`        | `p_offset`, `p_limit`                          | Active administrator; recorded actions and reasons                |
| `export_meetup_attendees` | `p_meetup_id`                                  | Active organiser/admin; minimal attendee data and audited export  |

Stage D list RPCs return `{items,total}`, validate pagination (1–100 rows, nonnegative offset up to 1,000,000), and use literal name/title substring searches or exact IDs. No Auth email addresses, profile bios or photos are returned. The UI uses 20-row pages. Private tables retain RLS and no browser grants.

Access changes require a 10–500 character reason. Administrator targets must be managed through trusted SQL; the dashboard cannot promote users or suspend administrators. Suspension blocks member features and hides an organiser's events from public discovery without altering their existing registrations. Restoring access re-enables eligible published events. Report resolution/dismissal requires a 10–1000 character review note; event removal and report closure remain separate recorded decisions. Exports are limited to 30 per member per hour and contain member ID, display name, RSVP state and registration time. See [stage-d-admin.md](stage-d-admin.md).

Own profile updates, event content updates/inserts, and report submissions use constrained table operations under RLS. `src/lib/community-api.ts` handles community data; `src/features/profile/profile-api.ts` handles the interest catalog and private profile photos. Event cover changes invoke the `event-image` function. Its `authorize_event_image(p_actor,p_event)` and `commit_event_image(p_actor,p_event,p_previous,p_path)` RPCs are executable only by `service_role`, after the endpoint verifies the caller. UI role flags control which buttons appear; PostgreSQL grants, RLS and RPC checks enforce access.

## Image storage

Two private buckets:

- `profile-photos`: 2 MiB; `${userId}/${uniqueName}.jpg|jpeg|png|webp`.
- `event-covers`: 5 MiB; `${eventId}/${uniqueName}.jpg|jpeg|png|webp`.

Supported MIME types are JPEG, PNG and WebP. Object paths are immutable: replacement uses a new unique path and then updates the owned profile/event reference. Overwrite/upsert is intentionally unavailable. Published organisers can replace covers without unpublishing. Closed/removed event covers cannot be changed. Public cover reads require a readable published event; profile photos remain private.

Permissive policies plus restrictive bucket boundaries prevent unrelated legacy Storage policies from opening these two buckets. Other buckets remain unaffected. The profile editor supports private uploads, replacement and removal, using authenticated downloads and local blob URLs. Hosted checks verified profile upload/reload/removal, anonymous-read denial and bucket MIME/size rejection. See [member-profiles.md](member-profiles.md) for the profile boundary. Stage C cover changes require server decoding/re-encoding through `event-image`; direct browser cover insert/delete and reference writes are blocked. See [stage-c-events.md](stage-c-events.md) for deployment order, limits and cover verification. Signed URLs are not used by either editor.

## Setup and future schema changes

See the root [README](../README.md) for local configuration, migration order, initial admin assignment and Auth URL setup. Keep the `private` schema unexposed and never ship a service-role key to the browser. Hosted authentication verification is documented in [authentication-verification.md](authentication-verification.md).

For future changes, add a new timestamped migration, test both clean setup and upgrades with existing rows, then apply it to development before production. Preserve old migrations. For breaking changes, add/backfill first, deploy compatible consumers, and remove old fields in a later migration after migration of existing data.

## Verification scope

`npm run test:db` runs real PostgreSQL 17 in a disposable loopback cluster. Auth identity and Storage metadata tables are test fixtures; roles, RLS, triggers, constraints, grants and competing connections are real PostgreSQL behaviour. The suite verifies historical upgrades, over-capacity rollback, profile privacy, spoofed roles, rate limits, image policy boundaries and lock contention, then applies the organiser workflow and checks current permissions.

`npm run test:e2e` verifies browser behaviour and Supabase request contracts with intercepted test responses. Hosted authentication results are recorded in [authentication-verification.md](authentication-verification.md), profile/Storage results in [member-profiles.md](member-profiles.md), and events/cover/attendance results in [stage-c-events.md](stage-c-events.md). Browser fixtures alone do not verify hosted services. No production database is used by these checks.
