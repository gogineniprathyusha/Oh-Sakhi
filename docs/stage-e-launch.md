# Stage E — Launch preparation

> Update: browser demo mode has been removed. Signed-out visitors now browse published Supabase events and sign in for account actions. Demo references below describe earlier-stage behavior and verification.


This stage prepares the existing application for launch. It does not publish a website, purchase a domain/service or certify legal compliance. Event emails remain Stage F; community growth remains Stage G.

## Product and accessibility

Public `/privacy`, `/terms`, `/guidelines` and `/contact` pages work without a session, including direct visits and reloads. Footer/authentication links reach them. They identify **Prathyusha Gogineni** as operator and **whiteperall@gmail.com** as public contact. Legal/community text is marked as a pre-launch draft for owner review. Contact opens email; there is no simulated form or invented response deadline.

Keyboard users get a skip link, clear focus indicators and a modal tab order that excludes disabled/hidden controls. Reduced-motion preferences are respected. Small muted text was darkened within the original rose/plum palette to meet the tested contrast thresholds. Layout, branding and sample content remain intact. Information pages and the member application load separately; React and Supabase have separate vendor chunks. A root error boundary offers reload/contact help instead of a blank screen.

## Account deletion

My profile → Delete my account loads an own-account summary. The member must enter their current password, type `DELETE` and acknowledge permanent removal. The browser supplies no account ID. The Edge Function verifies the bearer token with Auth, derives the ID/email from that identity, limits deletion attempts to five per fifteen minutes and checks the password using a separate non-persistent Auth client. Passwords/tokens are not logged or stored by this implementation. MFA accounts require support-assisted deletion rather than bypassing a second factor.

Administrator roles must be transferred/removed through the trusted owner workflow first. Upcoming published events must be cancelled before deletion. Suspended organisers can contact support for help. These conditions are enforced in the database before any cleanup.

Preparation creates a private deletion marker and suspends access. A trigger blocks accidental access restoration while deletion is pending. The server removes only this member's profile-photo prefix and their hosted events' cover prefixes, including unused files and covers uploaded with service credentials. Unrelated owned bucket files block preparation for support review. Production files are removed using the **Storage API**, never SQL deletion of Storage metadata. Each request handles at most ten batches, re-reading after removal. Failures leave access locked; retry continues safely without restoring already-removed files.

After cleanup, `auth.admin.deleteUser(id, false)` removes the Auth account. Existing foreign keys remove the profile/interests/access, RSVPs, submitted reports, and hosted events with their attendee/report/history records. Seats at other events are released. Security audit rows remain with nulled actor links; target identifiers and free-text notes may remain. Provider logs/backups and downloaded copies are outside immediate in-app removal. The confirmation screen and privacy draft explain these effects. If the final response is lost, the account may already be gone: try signing in or contact support rather than repeatedly creating replacement data.

Deletion is also available on the blocked-access screen, so suspended/deletion-pending members can retry. Support must check which files were already removed before attempting manual recovery. Supabase documents [Auth deletion and residual JWTs](https://supabase.com/docs/guides/auth/managing-user-data) and [Storage metadata versus bytes](https://supabase.com/docs/guides/storage/schema/design). Application RLS denies residual JWT member access after the profile/access row is removed.

## Development deployment

For another project, deploy the function first and apply only the new migration after the ten previous migrations:

```bash
npx --yes supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF
npx --yes supabase db query --project-ref YOUR_PROJECT_REF --linked --file supabase/migrations/202610170009_account_deletion.sql
```

The function uses Supabase's built-in server environment values, including the service-role and anon keys. Never put server keys in Vite variables or expose the private schema. Gateway JWT verification stays enabled and the endpoint also verifies identity with `getUser`. Browser roles receive only the own-account summary; preparation, file listing and attempt limiting are service-only. Applying the migration itself deletes no accounts or existing data.

The `delete-account` function and `202610170009_account_deletion.sql` have already been deployed/applied to the connected development project. Do not rerun the migration there. Existing accounts were not deletion test subjects.

## Verification

- All **62 Chrome browser tests**, **52 PostgreSQL checks**, **31 unit tests**, TypeScript, ESLint, both Deno function checks and the production build passed. Production dependency audit reported zero known vulnerabilities at verification time.
- Automated Axe checks found zero WCAG A/AA rule violations on the four information pages, demo discovery, the event dialog and the administrator overview after the contrast corrections. These sampled automated checks are not a complete manual accessibility certification.
- The supplied HTML design comparisons pass at desktop/mobile widths. Initial lazy-load timing assertions and dependency optimisation were corrected after the first full run; the final complete suite passed. All generated JavaScript chunks are below the build warning threshold.
- Production preview passed all five root/information routes, security/pre-launch indexing headers, 390px layout and zero page/CSP errors. A mobile Contact screenshot was reviewed. Vercel itself has not been deployed.
- A real hosted disposable-account check verified password denial, upcoming-event denial, browser denial of service-only RPCs, profile-photo and sanitised-cover cleanup, Auth/profile/hosted-event removal, and residual-token denial. The account was pre-confirmed with the Admin API, sent no email, and was deleted through the new endpoint. Credentials and its generated password stayed in process memory; none was written to the repo or printed. Its ordinary audit record may remain with a null actor, matching the documented audit-retention behavior. Existing members were not used as deletion targets.

Final hosted reads preserved the original **two profiles, four events, four registrations, fifteen registration-history rows, zero reports and one administrator**. There are zero suspended members, pending deletions or seat-counter mismatches. Browser UI tests use intercepted service responses; real database tests use disposable PostgreSQL with Auth/Storage interfaces represented by fixtures. Hosted deletion verification uses real development services and is separate from browser fixture coverage.

## Hosting and continuous verification

`vercel.json` declares Vite, `npm run build`, `dist`, direct information-page rewrites, CSP, `nosniff`, frame blocking, referrer/permissions policies and pre-launch `noindex`. `public/robots.txt` also prevents indexing until launch is approved. Production preview uses the same headers for local verification; Vercel has not been deployed or tested publicly. CSP permits the current Supabase hosts, blob image previews and Google Fonts; revisit it for custom Supabase domains or new providers.

GitHub CI uses Node 24, `npm ci`, TypeScript/lint, unit/PostgreSQL tests, Deno checks, Chrome tests and a production build. Official Actions are pinned to verified immutable references, permissions are read-only and checkout credentials are not persisted. Tests require no project secrets. Original HTML comparisons skip when the owner's Downloads file is absent. Failure traces are retained for seven days. Check the first actual remote workflow result after pushing.

After the owner approves a future Vercel deployment:

1. Import the reviewed branch with Node 24 and the build/output settings from `vercel.json`.
2. Set the intended public Supabase URL/browser key for each environment. Keep preview deployments on development data.
3. Choose/verify the domain. Set Supabase Auth Site URL and exact signup/recovery redirect URLs for that origin (`/?recovery=1` for recovery). Keep localhost allowlist entries for development; avoid broad production wildcards.
4. Configure verified-sender **authentication SMTP** before inviting members. This is separate from Stage F event emails. Follow [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp); keep SMTP credentials server-side. Review email verification, password rules and Auth rate limits, including any plan-dependent protections.
5. Review/approve the draft legal pages, contact inbox, privacy practices and retention periods. Publish final wording only after approval. Match promises to actual handling: [FTC consumer privacy guidance](https://www.ftc.gov/business-guidance/privacy-security/consumer-privacy).
6. Verify deployed headers/direct public URLs, signup/confirmation/recovery, two-account RSVP/moderation, image uploads and deletion with a disposable account. Check mobile/keyboard use. Remove the pre-launch indexing restrictions only when launch/indexing is approved.

## Operations and recovery

Monitor Supabase Auth/database/Storage/function errors and usage in the dashboard without logging passwords, tokens or request bodies. No paid monitoring or third-party telemetry has been installed. Investigate deletion failures using the exact account's marker and Storage objects, and retry through the endpoint; restoring access is not routine recovery.

Choose backup frequency, retention, destination, access permissions and operator responsibility before launch. Test restoration into a separate project. Database backups do **not** include Storage bytes, so avatar/cover backup requires separate handling. See [Supabase backup scope](https://supabase.com/docs/guides/database/overview). A restore can resurrect deleted data: maintain a protected reconciliation process outside the restored snapshot and reapply verified deletion requests before reopening access. This stage does not provision a backup service or invent retention deadlines.

Application rollback means deploying a previous reviewed commit. Database rollback uses reviewed follow-up migrations, not rerunning initial files or weakening RLS. The deletion schema is additive; check in-progress deletions before rollback.

## Owner-controlled launch steps

Domain/hosting approval, production Auth SMTP, final legal/retention decisions, backups/restore validation and operational monitoring ownership remain explicit launch steps. They have not been silently enabled, bought or marked complete. No public deployment has occurred.
