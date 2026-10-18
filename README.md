# Her Hobby Hour — Oh Sakhi!

Richmond’s women’s friendship and experiences community. The application uses **Vite, React and TypeScript**, the approved cream/blush/burgundy visual design, and **Supabase Auth + PostgreSQL**. Signed-out visitors browse published events; members use real accounts and database-backed RSVPs.

For a new coding session, start with [AGENTS.md](AGENTS.md) and the [project context](docs/project-context.md). The context records the current product rules, deployed website/email status and verification limits; older stage snapshots below may describe superseded setup states.

## Run on your Mac

Use Node.js **24 or later** and npm. From Terminal:

```bash
cd "/Users/abhi/Documents/Oh Sakhi"
npm install
npm run dev
```

Open the local URL printed by Vite, usually **http://localhost:5173**. Run these commands from **Oh Sakhi** itself; the redundant `her-hour-v3` directory has been removed. Existing terminals running the old project should be stopped with Control-C and restarted here.

The hero, login pages, branding and event cards use the approved October 18 design, with HH artwork, cream/blush/burgundy colours and floral details. Existing desktop/mobile navigation and application workflows are retained. See [the visual refresh guide](docs/brand-refresh.md). Configure Supabase to load real events and enable accounts. Desktop and mobile style comparisons against the supplied new preview are included in the browser tests.

## Visitors and member accounts

The homepage displays upcoming published events from Supabase, including public organiser labels and seat availability. Visitors can browse event details; hosting, RSVPs, profiles and personal plans require login. There are no sample events, browser-only bookings or editable guest profiles.

**Log in / Join** opens email/password login, signup and password recovery. Signed-in users use the database event directory and transactional registration APIs. Logging out returns to public discovery without displaying personal profile or registration data. Missing configuration shows a service-unavailable message and never substitutes sample content.

## Event permissions

| Action                                        | Who can do it                                               |
| --------------------------------------------- | ----------------------------------------------------------- |
| Create and publish an event immediately       | Any active member, under their own account                  |
| Edit a draft or published event               | Its organiser; edits preserve publication and registrations |
| RSVP and receive a confirmed seat immediately | Any active member, within capacity and before the deadline  |
| Cancel an RSVP                                | The member who reserved the seat                            |
| Cancel an event                               | Its organiser                                               |
| Remove an event for a community violation     | An administrator, with a recorded reason                    |

RSVPs are confirmed automatically. Organisers view attendees and manage event details; there is no attendance approval or decline step. Members can cancel their own RSVP and join again while registration is open and a seat is available. Capacity and deadlines are enforced by the database. See [docs/instant-rsvps.md](docs/instant-rsvps.md).

Admin removal hides the event from discovery, cancels active RSVPs and preserves audit/history records. Its organiser cannot republish it. Removal uses a `removed` status instead of physically deleting records. Capacity, access and ownership are enforced in PostgreSQL, independently of the UI.

## Connect Supabase when ready

The application has been connected and its authentication flows checked against the development Supabase project. Results are recorded in [docs/authentication-verification.md](docs/authentication-verification.md); profile editing and public photo visibility are documented in [docs/member-profiles.md](docs/member-profiles.md). For a new project, follow the setup steps below. Detailed schema and API notes are in [docs/database.md](docs/database.md).

1. Create your Supabase development project.
2. In its SQL Editor, apply these files **once each, in this order**. Deploy `event-image` before its image migration and `delete-account` before its deletion migration, following the linked stage guides:

   ```text
   supabase/migrations/202610130001_init.sql
   supabase/migrations/202610140001_reports.sql
   supabase/migrations/202610170001_foundation.sql
   supabase/migrations/202610170002_authorization_and_registrations.sql
   supabase/migrations/202610170003_storage.sql
   supabase/migrations/202610170004_organizer_workflow.sql
   supabase/migrations/202610170005_event_images.sql
   supabase/migrations/202610170006_instant_rsvps.sql
   supabase/migrations/202610170007_rsvp_counter_fix.sql
   supabase/migrations/202610170008_admin_dashboard.sql
   supabase/migrations/202610170009_account_deletion.sql
   supabase/migrations/202610170010_flexible_group_size.sql
   supabase/migrations/202610180001_public_profile_photos.sql
   ```

   If some migrations are already applied, run only the outstanding ones. The organiser-workflow migration supersedes the earlier admin-publication rules. Previously saved drafts remain private and can be published directly by their organiser; existing registrations are retained. The Stage C image migration requires the `event-image` function for cover changes; follow [its deployment order](docs/stage-c-events.md).

3. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```

   Use a public publishable (`sb_publishable_…`) or legacy **anon** key. Secret/service-role keys do not belong in browser variables. Invalid/placeholder/server-only configuration disables account and event services.

4. Set your local origin in Supabase’s authentication Site URL and redirect allowlist. Password recovery redirects to `http://localhost:5173/?recovery=1`; use your actual origin if Vite selects another port. Enable email/password authentication and email confirmation. Configure real email delivery before launch.
5. Restart Vite, choose **Log in / Join**, and register a real account. New accounts are ordinary members. Sign up a second account to test instant RSVPs and organiser attendee lists.
6. To designate your initial administrator, use the trusted SQL Editor after that account exists:

   ```sql
   insert into private.admin_roles(user_id)
   select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
   on conflict (user_id) do nothing;
   ```

   Do not grant roles through signup metadata. Keep `private` out of exposed API schemas.

7. With an active administrator account, use **Refresh plans** or sign in again to reveal **Admin** in desktop/mobile navigation. The dashboard provides statistics, report review, member suspension/restoration, event moderation, attendee exports and audit history. Organisers also have CSV export under **View attendees**. Follow [Stage D administration](docs/stage-d-admin.md) for setup, access semantics and verification.

Account deletion additionally needs the authenticated `delete-account` Edge Function deployed before its migration. See [Stage E launch preparation](docs/stage-e-launch.md) for deployment order, deletion effects, hosting configuration, backups and remaining launch decisions. The new public information pages use the operator/contact supplied by the owner and remain pre-launch drafts for review.

## Source layout

```text
Oh Sakhi/
├── src/
│   ├── app/App.tsx                # Session, navigation and action coordination
│   ├── components/               # Shared layout, cards, accessible modal and forms
│   ├── pages/                    # Discover, My plans, My hosted events, Circle, Profile, Auth, Admin
│   ├── features/events/          # Event types, details, request manager and date rules
│   ├── features/profile/         # Interest choices, image preparation and owned/public photo APIs
│   ├── features/admin/           # Protected API boundary, moderation forms and record lists
│   ├── features/account/         # Deliberate account deletion and retry UI
│   ├── hooks/                    # Auth/session and member-data loading
│   ├── lib/                      # Supabase client, API boundary, configuration
│   ├── styles/                   # Preserved visual design and responsive styles
│   └── main.tsx                  # React entry point
├── supabase/migrations/          # Original migrations plus additive improvements
├── supabase/functions/event-image/ # Server authentication and cover sanitization
├── supabase/functions/delete-account/ # Verified self-deletion and Storage cleanup
├── .github/workflows/verify.yml  # Credential-free checks on pushes/PRs
├── vercel.json                  # Prepared hosting headers and public-page rewrites
├── tests/{unit,browser,database}/
├── docs/database.md
├── index.html
├── vite.config.ts
├── playwright.config.ts
├── tsconfig.json
└── package.json
```

The retired vanilla JavaScript entry points were backed up outside the project at `/private/tmp/oh-sakhi-before-react-ny_hje9o`. That temporary backup is for recovery during this change; keep your own durable backup or commit the organised project to version control.

## Verification

```bash
npm run check       # Strict TypeScript for app/tests plus ESLint
npm run check:functions # Deno type checking for the Edge Function
npm test            # Event status, capacity and configuration
npm run test:db     # Real temporary PostgreSQL: RLS, migrations, history and races
npm run test:e2e    # Chrome suite plus mobile WebKit brand-rendering checks
npm run build      # Type checks and production output in dist/
npm run preview    # Serve dist/ locally
npm run format     # Consistent source formatting
```

Database tests use bundled PostgreSQL binaries and a fresh temporary database on loopback; they never read a remote database URL. Auth and Storage table interfaces are fixtures. The first group verifies the historical foundation, then the organiser-workflow migration is applied and current permissions are tested.

Browser tests need Google Chrome and Playwright WebKit (`npx playwright install webkit`) and start isolated Vite servers on **5183 and 5184**. The Chrome project runs the full suite; the mobile WebKit project verifies brand colors and usable event/login controls at 320px, 390px and 440px. Brand artwork uses SVG to avoid device-dependent emoji rendering. The configured test server uses intercepted responses, not a real Supabase project. Optional reference tests read `her-hobby-hour/home-preview.html`; set `HER_HOBBY_HOUR_DESIGN_DIR` to the supplied design folder if it is elsewhere. Screenshots/traces go into ignored `test-results/`.

## Remaining launch work

Hosted signup, email confirmation, login, profile persistence and logout have been verified; the project owner also verified password recovery. Neighborhood editing, database interest choices, and private profile photo upload/replacement/removal are implemented and checked against hosted Supabase. Details and verification limits are recorded in [docs/member-profiles.md](docs/member-profiles.md).

Stage C adds cover upload/replacement/removal, deadlines, end times, public organiser names, drafts and clearer availability/history. Organisers publish immediately; member RSVPs confirm automatically within capacity. See [docs/stage-c-events.md](docs/stage-c-events.md) for the server upload boundary, the new migration, deployment steps and verification results.

Stage D provides the protected admin dashboard, report review, member access controls, event moderation, statistics, CSV exports and audit history. Details are in [docs/stage-d-admin.md](docs/stage-d-admin.md). My circle clearly explains that connection requests and private messaging are not implemented. Private messaging is not implemented. Stage F event email setup is documented below.

Stage E adds public Privacy/Terms/Guidelines/Contact routes, password-confirmed account deletion, accessibility improvements, hosting headers/rewrites, CI and a launch/operations guide. See [docs/stage-e-launch.md](docs/stage-e-launch.md). Legal approval, domain/hosting approval, production Auth SMTP and retention/backup decisions remain owner-controlled launch steps. No public launch has been performed.

The remaining feature stages are **F — event emails** (RSVP confirmations, changes, cancellations and reminders), and **G — community growth** (waitlists, improved discovery, announcements/preferences and member feedback).

For later Vercel hosting, use the Vite preset, `npm run build`, and output directory `dist`. Set the public environment variables in the hosting project and update Supabase’s auth URLs to the deployed origin. No public deployment has been performed.

## Stage F — event emails

RSVP confirmations, date/time/venue changes, cancellations and 24-hour reminders use a private transactional queue, protected Supabase worker and signed Resend delivery webhooks. Apply `202610180002_event_emails.sql` once; delivery starts disabled. See [the activation guide](docs/stage-f-email-notifications.md) for the Resend webhook, the two Edge Function deployments and the separate hosted cron/Vault configuration and delivery activation scripts. No frontend secret or GoDaddy change is needed. Git/Vercel deployment does not apply SQL or enable email delivery.

Organiser emails use `202610180003_organiser_emails.sql`: publication confirmation and new-attendee notices share the same private queue/provider. Deploy the updated `event-emails` worker before running `supabase/setup/enable_organiser_emails.sql`; no new DNS or secrets are required. Existing attendee delivery is preserved.

Own-event cancellation confirmations use the additive `202610180004_organiser_cancellation_emails.sql` migration. Deploy the expanded worker, apply the migration once, then run `supabase/setup/enable_organiser_cancellation_emails.sql`. Repeated cancellation calls do not resend, and old cancellations are not backfilled. See the activation guide for recipient and pause rules.

Members cancelling their own spot receive **Your spot cancellation is confirmed**, independently of whole-event cancellation emails. This uses `202610180005_rsvp_cancellation_emails.sql` and the separate `supabase/setup/enable_rsvp_cancellation_emails.sql` activation script after worker deployment. Rejoining suppresses an unsent notice; repeated withdrawal does not resend it. See the activation guide for rollout and verification status.
