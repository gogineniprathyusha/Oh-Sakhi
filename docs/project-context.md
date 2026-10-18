# Her Hobby Hour project context

Last updated: **October 18, 2026**, during the custom profile interests and profile summary update on `feature/hh-brand-refresh`. The original brand refresh (`ce36ac4`), login refinements (`e242cc9`) and compact layout/spacing follow-up (`c6a935f`) were pushed on this branch, based on `main` at `109c890` (PR #14). The later navigation tint is documented below. The handoff and member spot-cancellation work are merged into that main revision. This is a dated handoff. Inspect current source/Git state and verify relevant hosted configuration before acting.

## Project and repository

- Product: **Her Hobby Hour — Oh Sakhi!** Previously called Her Hour; historical names still occur in immutable migrations, compatibility checks and reference-test filenames.
- Purpose: Richmond women's friendship, hobbies and in-person experiences; Indian-inspired and open to women of all backgrounds. Friendship, not dating.
- Operator: **Prathyusha Gogineni**. Public support/contact: **whiteperall@gmail.com**.
- Repository: <https://github.com/gogineniprathyusha/Oh-Sakhi>.
- Root application: `/Users/abhi/Documents/Oh Sakhi`; the old `her-hour-v3` wrapper was removed. Run development commands from this root.
- Frontend: Vite 7, React 19, TypeScript, existing project CSS. Backend: Supabase Auth, PostgreSQL/RLS, Storage and TypeScript/Deno Edge Functions. Email provider: Resend.
- The owner requested one consistent stack. The October 18 visual refresh adopts the supplied `her-hobby-hour/` login/home design, large HH artwork, compact HH icon, cream/blush/burgundy palette and floral details in the root React app. Existing workflows and desktop/mobile navigation are retained. See [brand-refresh.md](brand-refresh.md). The earlier Downloads HTML preview is superseded as the visual reference.

The shared sidebar and top bar use a very light warm blush gradient (`#FFF4F1` to `#FFEFED`) that blends into the existing page palette. Navigation text, active-state styling and layout remain intact. Verified October 18 with TypeScript/ESLint, 37 fixture-backed Chrome/mobile WebKit checks (including discovery and sampled accessibility), production build and desktop/mobile screenshot review. This is a frontend presentation change; no hosted configuration changed.

## Current product rules

| Area                | Agreed and implemented behavior                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public discovery    | Visitors browse real published Supabase events and public organiser labels/photos. Account actions require login.                                                                                                                                          |
| Accounts            | Email/password signup, confirmation, login, recovery, persistent sessions and logout. New accounts are ordinary members.                                                                                                                                   |
| Profiles            | Members view a profile summary and edit name, bio, city, neighborhood and up to twelve catalog/custom interests (new migration pending); upload/replace/remove their own photo. Current photos are public by default; other profile fields stay protected. |
| Hosting             | Active members create under their own account and publish immediately or save a private draft. No admin publication review.                                                                                                                                |
| Editing             | The organiser edits draft/published event details. Edits preserve ownership, publication and registrations. Closed events cannot be reopened.                                                                                                              |
| Capacity            | Hosts enter a positive integer, from 1 to PostgreSQL's integer limit. There is no old 30-seat cap; capacity cannot fall below confirmed attendance.                                                                                                        |
| RSVP                | An active member gets a confirmed seat immediately while registration is open and capacity remains. Repeated RSVP calls do not consume extra seats. No approval/decline UI.                                                                                |
| Withdrawal          | A member cancels their own RSVP and may rejoin while eligible. History is retained.                                                                                                                                                                        |
| Cancellation        | The organiser cancels their event from event details. Seats release and history remains. The organiser does not see Report on their own event.                                                                                                             |
| Moderation          | Administrators remove violating events with a reason, review reports, manage non-admin member access and inspect audited records. Admin rights come from private role tables, never signup metadata.                                                       |
| Personal navigation | My plans shows participation; My hosted events shows events the member organises. Header avatar opens My profile.                                                                                                                                          |
| Unimplemented       | My circle does not implement connections/private messaging. Stage G growth features are not implemented.                                                                                                                                                   |

Richmond times use `America/New_York`, independent of the visitor's browser timezone. The UI shows EDT or EST for the selected/event date, and rejects ambiguous or nonexistent daylight-saving wall times. The time control is the native input after a requested custom-control reversion. Event descriptions appear between location and organiser attribution.

Authentication adapts the owner's later login previews with the existing cream/blush/burgundy colours: the Richmond community label, visible “It’s your time to belong.” headline and supporting text, original HH artwork below without a circular crop, centred uppercase “HER HOBBY HOUR” in Georgia with pink script “Oh Sakhi!” beneath it, and three illustrated benefits: “Hobbies that heal”, “A community that gets you” and “A happier, you”. The wordmark uses `her-hobby-hour-updated-login-preview.html` as its reference, with responsive sizing and the same Brush Script MT/Snell Roundhand/cursive font stack. At the owner's request, the separate compact brand header is removed and the artwork scales with desktop viewport height up to 350 pixels, with a 220 pixel maximum on mobile. The right-hand form retains the owner's approved centred icon, heading and placeholder-only fields; its login subtitle is “Sign in to discover your next favorite experience.” All auth modes share this presentation; homepage branding is unchanged. See [brand-refresh.md](brand-refresh.md).

Above 790 pixels wide, the authentication card uses compact controls and height-responsive artwork/type to fit laptop windows. The headline and supporting paragraph use the full story width and wrap naturally as needed. The desktop story and benefits are centred together, with equal space above the Richmond label and below the benefits. The homepage gap beneath the final community note is reduced to 16 pixels. Login, signup and reset were verified without scrolling at five sizes from 1440 × 900 to 1280 × 640, including 1024 × 768. Narrower screens retain the readable stacked layout and scrolling; enlarged text or longer notices can grow the page. Verified October 18 with TypeScript/ESLint, 35 targeted fixture-backed Chrome/mobile WebKit checks, production build and screenshot review. No hosted changes, emails or deployment were performed.

Authentication panels use a shared soft blush watercolour-paper texture (`public/brand/blush-watercolour.webp`) with cream overlays; the form panel has a lighter wash for readability. The owner-approved logos, text placement and controls remain unchanged. [Texture provenance and prompt](brand-watercolour.md). Verified October 18 with TypeScript/ESLint, 25 fixture-backed Chrome/mobile WebKit checks, production build and visual screenshot review; no hosted writes or emails.

The illustration's outer paper edges now feather into the panel wash with a rectangular CSS mask, removing its visible background seam without changing the source artwork or layout. This follow-up passed TypeScript/ESLint, 14 fixture-backed Chrome/mobile WebKit branding/accessibility checks, production build and desktop/mobile screenshot review on October 18. No hosted changes or emails were performed.

Authentication's outer top-right and bottom-left corners now use a transparent botanical stem matching the original artwork's bronze leaves, pink buds and blossoms. It replaces the simpler floral SVG on authentication only. Verified October 18 with TypeScript/ESLint, 14 fixture-backed Chrome/mobile WebKit branding/accessibility checks, production build and desktop/mobile screenshot review; no hosted changes or emails. [Asset provenance and prompt](brand-botanical-stem.md).

Login navigation participates in browser history: Back from a hosting/login gate returns to discovery, Forward/reload restores the auth screen, and switching signup/reset modes does not stack extra entries. Back to experiences consumes an in-app auth entry; direct recovery callbacks are dismissed in place. No credentials or form values are stored in history.

Demo mode and sample events were deliberately removed. A missing/invalid Supabase configuration yields a service-unavailable state; do not restore a demo fallback.

## Stage status

| Stage                           | Status at handoff                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — foundation                  | Database constraints, relationships, indexes, private roles/access, RLS, registration/history and Storage foundation implemented. Later migrations supersede early publication/approval rules.            |
| B — authentication and profiles | Implemented; hosted authentication/profile checks recorded, password recovery confirmed by owner. Public photo visibility was added later.                                                                |
| C — events and attendance       | Implemented: publishing/drafts, editing, deadlines/end times, covers, cancellation, attendance/history. Approval was subsequently replaced by instant RSVP.                                               |
| D — administration              | Implemented: report review, member suspension/restoration, violation removal, statistics, audited exports/history.                                                                                        |
| E — launch preparation          | Information pages, account deletion, accessibility checks, hosting configuration and CI implemented. Website subsequently deployed; owner decisions below remain separate.                                |
| F — email notifications         | Implemented, deployed and enabled for attendee and organiser messages. Live inbox checks completed.                                                                                                       |
| G — community growth            | Future work: waitlists with clear seat-release rules, improved search/filtering, interest-based discovery, announcements/preferences and feedback from Richmond members. No implementation requested yet. |

## Hosting and environment

- Website has been deployed on **Vercel**, connected to the GitHub repository. Default production hostname: `oh-sakhi.vercel.app`.
- Custom domain bought through **GoDaddy**: `herhobbyhour.com`. Email event links use **`https://www.herhobbyhour.com`** as the canonical app base.
- The owner reported the custom domain working. Check the actual Vercel production branch/build/domain status when needed; Git pushes to feature branches do not inherently replace production. Production-branch deployment follows Vercel's configured Git integration.
- Supabase project ref: **`znuzfxbedoyuqpksvbcr`**. The local app and live website currently share this project. Do not assume a separate staging database exists.
- Frontend public settings are `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, documented in root `.env.example`. `.env.local` is ignored and must remain uncommitted. Hosting environment settings are configured separately from Git.
- Public publishable/legacy anon keys are intended for browser use; privileged service credentials are not. RLS and server RPC checks enforce access.
- Supabase Auth redirect settings must cover the intended website/local origins, including `/?recovery=1`. Do not assume event-email verification also verifies production Auth SMTP/redirect settings.
- `vercel.json` contains Vite build settings, public information-page rewrites and security headers. **Pre-launch indexing restrictions remain in source** (`X-Robots-Tag` and `public/robots.txt`). Deployment does not imply owner approval to remove them.
- Final legal wording, backups/restore validation, retention decisions and monitoring ownership need current confirmation. Public support pages identify the supplied operator/contact and remain drafts for review. Auth SMTP password-reset verification is recorded below; email quotas and a fresh signup through the new sender were not reviewed in that check.

## Supabase migrations and functions

The **17 migrations** through **`202610180005_rsvp_cancellation_emails.sql`** were applied to the configured project as of this handoff. Earlier migrations were applied manually/through SQL Editor or Management API. Do not blindly run `db push` or replay initial migrations against this project; reconcile actual applied state first. For a fresh project, use files in filename order and the documented function/setup rollout sequences.

A new 18th file, `202610180006_custom_profile_interests.sql`, is implemented and tested locally but **not applied to the shared hosted project**. It accepts bounded custom interests in the existing private profile array and maintains catalog links without making custom names public. Apply only this outstanding migration once before deploying the new profile editor; never replay the earlier files. See [member-profiles.md](member-profiles.md) for rollout and validation.

Important follow-ups to historical migrations:

- `202610170004_organizer_workflow.sql`: immediate organiser publication; supersedes early admin publication control.
- `202610170005_event_images.sql`: cover writes use the authenticated sanitising server endpoint.
- `202610170006_instant_rsvps.sql` and `202610170007_rsvp_counter_fix.sql`: instant RSVP and safe counters; approval RPC execution retired for browser roles.
- `202610170008_admin_dashboard.sql`: protected administration APIs and exports.
- `202610170009_account_deletion.sql`: deliberate self-deletion, server cleanup and private pending markers.
- `202610170010_flexible_group_size.sql`: positive integer capacities without the original 30-seat cap.
- `202610180001_public_profile_photos.sql`: controlled public reads of current active-member avatars; private profile fields stay private.
- `202610180002_event_emails.sql`: private transactional queue, revisions/generations and worker/webhook RPCs.
- `202610180003_organiser_emails.sql`: publication and new-attendee messages.
- `202610180004_organiser_cancellation_emails.sql`: organiser's own cancellation confirmation.
- `202610180005_rsvp_cancellation_emails.sql`: member spot-cancellation confirmation, safe rejoining and current-details refresh.

Deployed Edge Functions:

| Function         | Responsibility                                                                                    | Authentication                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `event-image`    | Decode/re-encode cover images, link owned references and clean up superseded files                | Gateway JWT verification plus server Auth/ownership checks                                                |
| `delete-account` | Verify own identity/password, freeze access, remove owned Storage files, then delete Auth account | Gateway JWT verification plus server identity/password checks                                             |
| `event-emails`   | Claim due queue jobs and send through Resend                                                      | Gateway JWT disabled intentionally; dedicated worker bearer token checked against a private database hash |
| `email-webhook`  | Record delivery/bounce/complaint, deduplicate events and suppress problem addresses               | Gateway JWT disabled intentionally; raw-body Svix signature/timestamp verification                        |

Supabase CLI was logged in during the previous work; access can expire. Typical deployment: `npx --yes supabase functions deploy FUNCTION --project-ref znuzfxbedoyuqpksvbcr --use-api`. Management API SQL used `supabase db query --project-ref ... --linked --file PATH`. Confirm CLI support and target before use. Never print private credentials to diagnose access.

## Authentication SMTP — owner verification on October 18, 2026

The owner checked Supabase Auth's custom SMTP toggle and initially found it off. After following the Resend SMTP setup instructions, the owner reported receiving a password-reset email from **`events@alerts.herhobbyhour.com`** and successfully completing the reset on the website. This records user-confirmed sender delivery and the recovery flow after custom SMTP setup, separate from the Stage F event-email integration.

This was not an independent API/dashboard audit: saved SMTP credentials and every Auth/redirect setting were not inspected. A fresh signup/confirmation through the new sender and configured Auth/Resend sending limits were not separately verified. Keep credentials private; no application code or SQL migration was required for the dashboard SMTP setup.

## Email behavior and verified setup

Resend sending domain **`alerts.herhobbyhour.com`** was verified through GoDaddy auto-configuration. Sender: **Her Hobby Hour &lt;events@alerts.herhobbyhour.com&gt;**. Reply-to: **whiteperall@gmail.com**. No additional mailbox/alias creation was needed for the sender local part `events`.

Server-only Edge Function secret names: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `APP_BASE_URL`, `RESEND_WEBHOOK_SECRET`. Their values belong in Supabase secrets, not frontend/Vercel browser variables or this repository. Built-in Supabase server credentials are also private.

Webhook: `https://znuzfxbedoyuqpksvbcr.supabase.co/functions/v1/email-webhook`, subscribed to `email.delivered`, `email.bounced` and `email.complained`. The owner saved its signing secret in Supabase; signed delivery callbacks were verified.

| Message                              | Recipient and trigger                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| RSVP confirmation                    | The member who reserves/re-reserves a seat                                                                                |
| Event update                         | Current confirmed attendees after start/timezone/venue changes                                                            |
| Attendee cancellation                | Previously confirmed attendees when a published event is cancelled or removed                                             |
| Reminder                             | Still-confirmed attendees approximately 24 hours before start; late RSVPs do not get an immediate extra reminder          |
| Your event is published              | The organiser on a real publication transition                                                                            |
| Someone joined your event            | The organiser on a new confirmed registration; includes attendee display name, never attendee contact email               |
| Your event cancellation is confirmed | The organiser when cancelling their own event, including drafts/events with no attendees; repeated Cancel does not resend |
| Your spot cancellation is confirmed  | The member who cancels their own confirmed seat; whole-event closure uses its separate notice                             |

Description/title/cover/capacity edits do not trigger schedule-update emails. Organiser cancellation confirmation does not claim asynchronous attendee mail has already arrived. Admin removal is not described as the organiser's own cancellation. Ordinary organisers receive their notices without having their own attendee RSVP.

Hosted setup/activation scripts already applied:

- `supabase/setup/configure_event_emails.sql`: Vault credential/hash and named schedules. Rerunning pauses global delivery; do not use it as a routine health check.
- `supabase/setup/enable_event_emails.sql`.
- `supabase/setup/enable_organiser_emails.sql`.
- `supabase/setup/enable_organiser_cancellation_emails.sql`.
- `supabase/setup/enable_rsvp_cancellation_emails.sql`.

At last verification, `private.email_config` had **`enabled=true`**, **`organiser_enabled=true`**, **`organiser_cancellation_enabled=true`** and **`rsvp_cancellation_enabled=true`**. Scheduler jobs: `event-emails-every-minute` (`* * * * *`) and `event-email-retention` (`15 8 * * *`). These run on Supabase; no open browser or Vercel backend process is needed. Jobs normally submit during the next minute, with queue/provider delays possible.

Messages queue in the same transaction as the relevant action. Delivery uses row leases/`SKIP LOCKED`, single recipients, frozen provider payloads, stable idempotency keys, bounded retries and a 23-hour retry cutoff. Eligibility is rechecked before send; suppression handles bounces/complaints. An email already in flight cannot be recalled. See the Stage F guide before modifying retry, pause or suppression behavior.

Live checks on October 18 used explicitly approved owned inboxes and labelled events. The owner confirmed attendee confirmation/update/reminder/cancellation, organiser publication/join, and organiser cancellation messages arrived. Signed webhooks recorded delivery. Repeated publication/RSVP/cancellation calls did not duplicate notices. Test events were cancelled, seats released, history retained and pending test work cleared. These approvals do not authorize further test messages to those or other addresses without an agreed scope.

Member spot-cancellation email (`rsvp_cancelled`) is now implemented with migration `202610180005` and its activation script applied. It confirms only the reservation withdrawal, does not notify the organiser of withdrawal, and is independent of organiser delivery switches. Rejoining invalidates an unsent/leased notice; whole-event closure, recipient eligibility and suppression are rechecked before submission. A separately approved five-email test passed actual scheduler/signed-webhook delivery and owner-confirmed inbox receipt, including exactly one spot-cancellation confirmation despite repeated withdrawal. The test event is cancelled with history preserved, zero occupied seats and no pending jobs. See the Stage F guide for details.

Git/Vercel changes do not automatically migrate Supabase or deploy functions. The initial attendee/organiser email backend was deployed/enabled before PR #13; the member spot-cancellation extension was separately deployed during this follow-up. Both have already been applied to the configured project; fetching the corresponding Git changes requires no migration replay there.

## Code map and commands

| Path                                               | Purpose                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/App.tsx`                                  | Navigation, event deep links, session/action coordination            |
| `src/components/Layout.tsx`, `src/styles/`         | Existing desktop/mobile shell and visual design                      |
| `src/components/EventForm.tsx`                     | Host event form, deadlines/end time/capacity validation              |
| `src/features/events/`                             | Details, covers, attendee/export UI, time conversion and event types |
| `src/lib/community-api.ts`, `src/hooks/`           | Supabase API boundaries, session and community data                  |
| `src/features/profile/`                            | Profile/interests/photo behavior                                     |
| `src/features/admin/`, `src/pages/Admin.tsx`       | Protected moderation and audit UI                                    |
| `src/features/account/`                            | Account deletion UI/API                                              |
| `src/pages/Information.tsx`                        | Privacy, terms, guidelines and contact content                       |
| `supabase/functions/`                              | Server endpoints, email worker/templates and signed webhook          |
| `supabase/migrations/`, `supabase/setup/`          | Immutable schema changes and deliberate hosted setup/activation      |
| `tests/unit/`, `tests/database/`, `tests/browser/` | Node unit tests, real local PostgreSQL, Playwright browser tests     |
| `.github/workflows/verify.yml`                     | Node 24 CI: checks, tests, Deno checks and build                     |

Use Node.js **24 or later**. Run from the repository root:

```sh
npm ci
npm run dev              # Usually http://localhost:5173; use the URL printed by Vite
npm run check            # Strict TypeScript + ESLint
npm test                 # Node unit/server-handler tests
npm run test:db          # Disposable local PostgreSQL; no hosted URL or credentials
npm run check:functions  # Deno checks for Edge Functions
npm run test:e2e         # Playwright Chrome + selected mobile WebKit tests
npm run build            # Type checks and Vite production bundle in dist/
```

Browser tests start fixture-backed Vite servers on 5183/5184. They need Chrome and Playwright WebKit. The optional approved-design comparisons use `HER_HOBBY_HOUR_DESIGN_DIR` (default `her-hobby-hour/`) and skip when that supplied folder is absent. `.env.local`, `dist/`, screenshots/traces and test output are ignored; keep them out of commits.

Visual refresh verification on October 18: TypeScript/ESLint, **37 unit tests**, **85 fixture-backed browser checks** (Chrome and selected mobile WebKit, including the new supplied design comparisons), production build and diff formatting passed. Desktop/mobile home and login screenshots were reviewed. No database/function implementation changed, and no hosted writes or emails were performed; database and Deno checks were not rerun for this frontend change. See [brand-refresh.md](brand-refresh.md).

Browser-history follow-up on October 18: reproduced Contact → community → hosting/login → browser Back returning to Contact before the fix. After the fix, **46 targeted fixture-backed browser checks** passed in Chrome and mobile WebKit, including both hosting buttons, Back/Forward, auth-mode changes, reloads, direct recovery dismissal and event-email links. TypeScript/ESLint, all **37 unit tests**, the production build and diff formatting also passed. The full browser suite was not rerun for this follow-up; no hosted writes or emails were performed.

Login placement refinement verification on October 18, repeated after restoring the original HH artwork and centred form from the owner’s screenshots: TypeScript/ESLint, **37 unit tests**, **50 targeted fixture-backed browser checks** in Chrome and mobile WebKit, production build and diff formatting passed. Responsive checks cover 320, 390, 440, 800, 1024 and 1440 pixel widths, including content order and non-overlap. Screenshots were visually reviewed at desktop, tablet and mobile sizes. Authentication, accessibility, recovery and browser Back/Forward checks passed. The full browser suite was not rerun for this presentation-only refinement; no hosted writes, test emails or deployments were performed.

Last recorded full non-browser verification for the member spot-cancellation implementation: **37 unit tests**, **58 real PostgreSQL tests**, TypeScript/ESLint, Deno function checks and production build passed. Earlier browser/email-link and mobile verification is documented separately; the full browser suite was not rerun for the cancellation-template extensions. Counts are historical evidence, not a requirement to freeze the suite at those numbers.

## Detailed documents and known historical wording

- [Current visual identity and design verification](brand-refresh.md)
- [Authentication verification](authentication-verification.md)
- [Member profiles and public photos](member-profiles.md)
- [Event workflow and covers](stage-c-events.md)
- [Current instant RSVP rules](instant-rsvps.md)
- [Database and API reference](database.md)
- [Administration](stage-d-admin.md)
- [Launch preparation, deletion and operations](stage-e-launch.md)
- [Email implementation, activation, delivery evidence and pause procedures](stage-f-email-notifications.md)

Some reports/README sections still say demo, private photos, attendance approval, emails pending or no Vercel deployment. Those statements describe earlier stages and must not override the later rules/status above. Storage buckets remaining private is compatible with current photos being publicly readable through narrowly scoped policies. Applied historical migrations must remain unchanged even when their former product behavior has been superseded.

The previous product work is complete; no feature task remains pending from that chat. For the next task, first understand the user's request, inspect relevant current code and branch status, then work within that scope.
