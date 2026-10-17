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

The historical foundation required administrator publication. **The organiser-workflow migration replaces that policy.** Apply all seven files for the current application and deploy the `event-image` function for covers. The frontend reads `meetup_directory` and uses registration RPCs; it does not write registration rows directly. Existing manual SQL Editor installations should apply only outstanding files.

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

Members create events under their own account. Organisers publish or save drafts directly, edit their own active events, decide attendance and cancel events. Edits to title, time, location, description, capacity or imagery keep publication and registrations intact and mark `details_updated_at`. Attendees see a details-changed notice; automated notifications are not implemented.

Organisers may approve pending/declined requests, decline a pending request, or revoke an existing approval. Approval obeys capacity and active-member checks. Existing requests may be decided after the submission deadline, but not after the event starts. A withdrawn request cannot be approved again until the member submits a new one. An admin can decide seats only when they are that event’s organiser.

Administrators can remove violations after publication, with a required reason. This sets `removed`, cancels outstanding requests/approved seats and writes an audit record. The event and registration history remain stored. Organisers cannot undo removal. Closed events cannot be reopened. Browser roles cannot hard-delete events. Administrator event-field access retained for moderation does not confer attendance-decision rights.

Capacity is protected by transactions, locks on the event row, a maintained approved counter and a database CHECK. Approvals, capacity edits, cancellation and removal serialize against the same row. Pending requests reserve no seats. Direct registration writes, self-approval and ownership changes are denied.

## Browser API contract

Use the current authenticated session. Arguments are named exactly as shown:

| API                       | Arguments                                                        | Access                                                           |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `request_meetup`          | `p_meetup_id`                                                    | Active member, published event, before deadline/start            |
| `withdraw_meetup_request` | `p_meetup_id`                                                    | Own pending/approved request                                     |
| `decide_meetup_request`   | `p_meetup_id`, `p_user_id`, `p_decision` (`approved`/`declined`) | Event organiser only                                             |
| `set_meetup_status`       | `p_meetup_id`, `p_status`                                        | Event organiser; draft/published/cancelled/completed transitions |
| `moderate_meetup`         | `p_meetup_id`, `p_reason` (10–1000 characters)                   | Active administrator                                             |
| `get_meetup_attendees`    | `p_meetup_id`                                                    | Organiser/admin; minimal display name and request state          |
| `get_my_access`           | None                                                             | Current member’s status and trusted admin flag                   |
| `set_member_interests`    | `p_interest_ids`                                                 | Current active member                                            |
| `set_member_access`       | `p_user_id`, `p_status`, `p_reason`                              | Administrator                                                    |
| `review_report`           | `p_report_id`, `p_status`, `p_note`                              | Administrator                                                    |
| `admin_statistics`        | None                                                             | Administrator                                                    |

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
