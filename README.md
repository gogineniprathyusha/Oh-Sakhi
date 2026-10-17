# Her Hour — Oh Sakhi!

Richmond’s women’s friendship and experiences community. The application uses **Vite, React and TypeScript**, the approved preview’s original CSS, and **Supabase Auth + PostgreSQL**. One frontend serves both the browser-only demo and real member accounts.

## Run on your Mac

Use Node.js **24 or later** and npm. From Terminal:

```bash
cd "/Users/abhi/Documents/Oh Sakhi"
npm install
npm run dev
```

Open the local URL printed by Vite, usually **http://localhost:5173**. Run these commands from **Oh Sakhi** itself; the redundant `her-hour-v3` directory has been removed. Existing terminals running the old project should be stopped with Control-C and restarted here.

No Supabase account or credentials are needed to explore the website. The six samples, hero, branding, navigation, category filters, profile editor and local hosting retain the original interactive HTML design. Desktop and mobile reference comparisons are included in the browser tests. The original preview in Downloads is untouched.

## Demo and member accounts

The demo banner identifies sample events and browser-only edits. You can RSVP/cancel sample seats, create/edit/cancel your own sample plan, and use **View attendees → Add sample attendee** to explore capacity. RSVPs confirm immediately when a seat is available. Cancelled plans remain in your history. Sample dates remain visible even after they pass.

Demo state uses local storage key `her-hour-demo-v1`, preserving existing local edits when using the same browser and origin. **My profile → Reset demo data** restores the original examples. Blocked or corrupt storage does not prevent the site from loading. Demo data is never uploaded or copied to a real account.

**Log in / Join** explains setup when Supabase is unconfigured. With valid public configuration, it opens email/password login, signup and password recovery. Signed-in users use the database event directory and transactional registration APIs; logging out returns to the separate demo.

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

The application has been connected and its authentication flows checked against the development Supabase project. Results are recorded in [docs/authentication-verification.md](docs/authentication-verification.md); profile editing and private photos are documented in [docs/member-profiles.md](docs/member-profiles.md). For a new project, follow the setup steps below. Detailed schema and API notes are in [docs/database.md](docs/database.md).

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
   ```

   If some migrations are already applied, run only the outstanding ones. The organiser-workflow migration supersedes the earlier admin-publication rules. Previously saved drafts remain private and can be published directly by their organiser; existing registrations are retained. The Stage C image migration requires the `event-image` function for cover changes; follow [its deployment order](docs/stage-c-events.md).

3. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   ```

   Use a public publishable (`sb_publishable_…`) or legacy **anon** key. Secret/service-role keys do not belong in browser variables. Invalid/placeholder/server-only configuration keeps the demo available.

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
│   ├── pages/                    # Discover, My plans, Host desk, Circle, Profile, Auth, Admin
│   ├── features/events/          # Event types, details, request manager and date rules
│   ├── features/profile/         # Interest choices, image preparation and private photo API
│   ├── features/admin/           # Protected API boundary, moderation forms and record lists
│   ├── features/account/         # Deliberate account deletion and retry UI
│   ├── hooks/                    # Auth/session and member-data loading
│   ├── lib/                      # Supabase client, API boundary, config and demo store
│   ├── data/                     # Original preview’s six sample events
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
npm test            # Demo persistence, capacity and configuration
npm run test:db     # Real temporary PostgreSQL: RLS, migrations, history and races
npm run test:e2e    # Chrome: desktop/mobile, auth fixtures and design comparison
npm run build      # Type checks and production output in dist/
npm run preview    # Serve dist/ locally
npm run format     # Consistent source formatting
```

Database tests use bundled PostgreSQL binaries and a fresh temporary database on loopback; they never read a remote database URL. Auth and Storage table interfaces are fixtures. The first group verifies the historical foundation, then the organiser-workflow migration is applied and current permissions are tested.

Browser tests need Google Chrome and start isolated Vite servers on **5183 and 5184**. The configured test server uses intercepted responses, not a real Supabase project. Optional reference tests read `~/Downloads/her-hour-interactive-preview.html`; override with `HER_HOUR_REFERENCE_HTML` if necessary. Screenshots/traces go into ignored `test-results/`.

## Remaining launch work

Hosted signup, email confirmation, login, profile persistence and logout have been verified; the project owner also verified password recovery. Neighborhood editing, database interest choices, and private profile photo upload/replacement/removal are implemented and checked against hosted Supabase. Details and verification limits are recorded in [docs/member-profiles.md](docs/member-profiles.md).

Stage C adds cover upload/replacement/removal, deadlines, end times, public organiser names, drafts and clearer availability/history. Organisers publish immediately; member RSVPs confirm automatically within capacity. See [docs/stage-c-events.md](docs/stage-c-events.md) for the server upload boundary, the new migration, deployment steps and verification results.

Stage D provides the protected admin dashboard, report review, member access controls, event moderation, statistics, CSV exports and audit history. Details are in [docs/stage-d-admin.md](docs/stage-d-admin.md). My circle clearly explains that connection requests and private messaging are not implemented. No notifications or real messages are simulated.

Stage E adds public Privacy/Terms/Guidelines/Contact routes, password-confirmed account deletion, accessibility improvements, hosting headers/rewrites, CI and a launch/operations guide. See [docs/stage-e-launch.md](docs/stage-e-launch.md). Legal approval, domain/hosting approval, production Auth SMTP and retention/backup decisions remain owner-controlled launch steps. No public launch has been performed.

The remaining feature stages are **F — event emails** (RSVP confirmations, changes, cancellations and reminders), and **G — community growth** (waitlists, improved discovery, announcements/preferences and member feedback).

For later Vercel hosting, use the Vite preset, `npm run build`, and output directory `dist`. Set the public environment variables in the hosting project and update Supabase’s auth URLs to the deployed origin. No public deployment has been performed.
