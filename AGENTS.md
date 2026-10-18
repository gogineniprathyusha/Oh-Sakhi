# Project instructions

## Start here

- Read [docs/project-context.md](docs/project-context.md) and [README.md](README.md) before making changes. Read the feature-specific documents linked in the context file as needed.
- Inspect Git status and the relevant source before editing. This repository contains an existing application; extend its architecture and visual design.
- Treat the dated context document as a handoff, not a live service check. Confirm relevant external state before changing a hosted service. Some older stage reports describe superseded behavior; the context document identifies the current rules.

## Scope and workflow

- The application is at the repository root: Vite, React, TypeScript and Supabase. Work in root `src/`, `supabase/` and `tests/` unless the user explicitly selects another application.
- Create a branch from current `main` for implementation changes. Preserve unrelated tracked/untracked work; never stage everything without reviewing it. Do not force-push, discard work or merge into `main` without authorization.
- The user prefers completing authorized work without repeated confirmation. Ask only for missing information or authorization that is actually needed. An answer-only or planning request does not authorize implementation.
- Do not infer an instruction to push from an instruction to edit. Report the branch, checks and any outstanding deployment steps when finished.
- Keep `docs/project-context.md` current when product rules, implementation status or deployed infrastructure materially change. Record dates, evidence and verification limits. Store no credentials or full chat transcripts.

## Product and design

- Brand: **Her Hobby Hour — Oh Sakhi!**, a women's friendship and hobby community in Richmond, Virginia. Preserve the existing cream, rose and plum design and responsive desktop/mobile experience.
- Members publish immediately or save drafts. No administrator publication approval.
- RSVPs confirm immediately while capacity and deadlines permit. No organiser/admin attendance approval. Members can withdraw their own RSVP.
- Organisers edit and cancel their own events; administrators remove violations with a recorded reason. Retain cancellation/removal history.
- Keep **My plans** (member attendance) distinct from **My hosted events** (organiser management). The internal `HostDesk.tsx` filename is historical.
- Current profile photos are public by default through controlled Storage policies; private profile fields and attendee lists stay protected.
- Do not reintroduce demo content or local simulated accounts/bookings. Without configuration, show a clear service-unavailable state.
- Use `America/New_York` for Richmond event calculations and date-appropriate EDT/EST labels. Do not hard-code a daylight-saving offset for all dates.

## Database and services

- Preserve existing Supabase Auth, RLS, scoped grants, private administrator roles, capacity locking/counters and audit/history behavior. Browser visibility alone is never authorization.
- Never edit or replay an already-applied migration. Add a new timestamped migration; test clean setup and upgrades with existing data for database changes.
- Git/Vercel deployment does not apply SQL, deploy Edge Functions or activate email delivery. Report which of these actions were actually completed.
- The configured Supabase project is shared with the live website. Treat hosted writes as live data changes, despite older documents calling it development.
- Use disposable local database tests where possible. For live tests that send email, obtain an agreed recipient and scope first; past test approvals are not blanket permission for future messages. Preserve unrelated records and clean up scoped test resources.
- Keep service credentials server-side. Never commit or print `.env.local`, passwords, Auth tokens, Resend keys, webhook signing secrets, service-role keys or decrypted Vault values. `.env.example` contains placeholders only.
- Do not disable RLS/JWT/signature/token checks to work around an error. Email worker and webhook gateway JWT settings intentionally differ from authenticated image/deletion functions; preserve their application-level checks.

## Validation

- Use the root `package.json` scripts. Node.js 24 or later and npm are the project standard.
- App changes: run `npm run check`, relevant tests and `npm run build`.
- Database changes: also run `npm run test:db`; it uses isolated PostgreSQL and never needs hosted credentials.
- Edge Function changes: also run `npm run check:functions` and relevant unit tests.
- UI/interaction changes: run relevant Playwright tests; include mobile/WebKit checks when layout or browser behavior is affected.
- Documentation-only changes: check formatting, referenced paths and `git diff --check`; an application rebuild is unnecessary.
- Distinguish fixture tests, real local PostgreSQL tests, hosted service checks and user-confirmed inbox/browser results. Do not claim unperformed verification.
