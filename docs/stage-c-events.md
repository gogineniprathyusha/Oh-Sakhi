# Stage C events and attendance

Stage C builds on the merged authentication and member-profile work using Vite, React, TypeScript and Supabase. The approved sample design remains the fallback artwork; real covers appear on cards and event details.

## Event workflow

Organisers can publish immediately or save a draft. A draft is visible to its organiser and administrators; the organiser can publish it directly from event details. Edits preserve publication and registrations. The form adds a public organiser label, an optional end time and an optional registration deadline. Blank deadlines follow the event start. Cover controls are available under **Edit plan** after the event exists and save separately from the text form.

Organisers can cancel a draft or published event directly from its details, beside **Edit plan**. **Manage requests → Back to event** returns to these actions. Other members can report an event; the organiser does not see a report action on their own event. Cancellation retains its confirmation step, releases seats and preserves history.

All event form times are Richmond (`America/New_York`) wall times, converted independently of the visitor's browser timezone. The form rejects impossible dates, the spring daylight-saving gap and repeated fall-back times rather than silently selecting an offset. End times must follow the start; deadlines cannot follow it. A newly published event needs a future start and deadline. An organiser may still edit an event whose request deadline has passed, as long as its start remains in the future.

Discovery shows upcoming published member events. Host desk and My plans preserve accessible history. Cards/details distinguish full, closed, cancelled, completed and past events. Withdrawn requests remain in My plans and can be resubmitted while registration is open. Pending requests reserve no seat. Only the organiser approves, declines, reconsiders or revokes attendance. Cancellation releases seats and preserves history. Use **Refresh plans** to retrieve changes from another account; this does not implement realtime subscriptions or notifications.

## Cover upload boundary

`supabase/functions/event-image` is a TypeScript Edge Function with pinned dependencies and a Deno lockfile. It verifies the caller with Supabase Auth, checks active organiser access and limits cover operations to forty per member per hour. Request bodies are bounded before multipart parsing.

The server checks byte signatures, forces a JPEG/PNG/WebP decoder, decodes and re-encodes with ImageMagick WASM, strips source metadata, and stores a new WebP under the event UUID. Inputs are limited to 5 MiB, decoder dimensions to 4096 per edge and four million pixels, output to 1600 per edge. Resource limits bound image memory; invalid/corrupt images are rejected. The browser also resizes selected photos before sending them. The image-processing package is server-only and is not part of the frontend bundle.

The new SQL migration removes browser grants for `meetups.cover_path` and blocks direct browser Storage insertion/deletion in `event-covers`. Existing read policies, covers, profiles and registrations remain. Only service-role RPCs can commit a validated cover reference. They recheck active ownership, event state and the expected previous reference under a row lock. The Edge Function obtains the actor from the verified session, never from a caller-supplied role or user ID. The server credential stays in the Edge Function environment.

A replacement is linked before its predecessor is removed. An interrupted commit response is reconciled by reading the current reference. Failed cleanup offers a retry; cleanup never deletes the currently referenced image or a path outside that event. Browser previews use authenticated downloads and revocable blob URLs. Published covers are readable wherever the existing event/Storage policies allow; draft covers remain restricted. Cross-service uploads and profile/event writes are not one transaction. Closing the editor during failed cleanup, or a server interruption after upload, can leave a private unused object for later maintenance. Profile photos retain their Stage B upload path; the new server endpoint validates event covers.

The WASM approach follows [Supabase's image-processing example](https://supabase.com/docs/guides/functions/examples/image-manipulation); implementation and limits are tested separately from the hosted service.

## Setup for another development project

For an existing project with the first six migrations already applied:

1. From the project folder, sign into the CLI:

   ```bash
   npx --yes supabase login
   ```

2. Deploy the function to the intended development project, with JWT verification enabled:

   ```bash
   npx --yes supabase functions deploy event-image --project-ref YOUR_DEVELOPMENT_PROJECT_REF --use-api
   ```

3. Apply **only** `supabase/migrations/202610170005_event_images.sql`, once. Continue the existing SQL Editor workflow, or use the authenticated Management API:

   ```bash
   npx --yes supabase db query --project-ref YOUR_DEVELOPMENT_PROJECT_REF --linked --file supabase/migrations/202610170005_event_images.sql
   ```

   Earlier migrations were applied manually; do not replay them. The new migration does not delete rows. Its revocations deliberately require cover changes to pass through the validated function.

4. Run `npm run dev`, log in and use **Edit plan → Event cover**. No new browser environment variable is needed. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server runtime values supplied by Supabase; never put the service key in `.env.local` or a `VITE_` variable.

For a fresh project, apply all seven SQL files in filename order and deploy the function before testing covers. For an existing project, preserve its applied migration history and run only outstanding files.

## Verification

Local checks passed: strict TypeScript and ESLint (including function source), 22 unit/server-handler checks, 31 real PostgreSQL checks, 46 Chrome checks and the production build. Deno type checking and WASM initialization also passed. Browser checks include a two-account fixture flow, cover replacement/removal/failures, draft publication, Richmond time conversion from a Los Angeles browser, 320/390px event editors, and both original-preview comparisons. PostgreSQL checks exercise real locks for the last seat, ownership, preserved registrations, service-only image commits and a clean seven-migration setup.

A final demo draft-publication adjustment was rechecked in all twenty affected demo/event/auth browser checks. The built site was also checked locally for homepage rendering, loading the separate event-editor chunk, and demo draft publication with zero page errors.

Hosted deployment and native Chrome checks also passed on October 17, 2026, against the configured Oh Sakhi development project:

- Deployed `event-image` with JWT verification enabled, then applied `202610170005_event_images.sql` once through the authenticated Management API. Earlier SQL files were not replayed or modified. Aggregate row counts were unchanged by the migration: two profiles, zero events and zero registrations before the live test.
- Verified that browser roles cannot update cover references or execute the cover-commit RPC, while the server role can.
- Two different existing accounts signed in through isolated Chrome windows. The owner entered passwords directly; passwords and session tokens were not recorded or written to files.
- Created one clearly labelled test draft with deadline/end values; it was hidden from the other member. Uploaded, replaced and removed covers through the deployed function, verified reload, and confirmed superseded objects disappeared from Storage listings. The other member could not download a draft cover; direct browser upload to `event-covers` was rejected.
- Published without an administrator step. The other member could view the event and cover, request attendance, and see approval. Organiser revocation/reconsideration worked; a member's attempt to decide their own attendance was rejected.
- Event edits preserved publication and the approved seat. Withdrawal released it; a subsequent request worked.
- Removed every test cover, cancelled the test event, verified the member's cancelled history, and logged both accounts out. The test event and registration remain as cancelled history, consistent with the product rules. No member profile was changed.

Simultaneous final-seat approval was verified in real disposable PostgreSQL connections; the hosted two-account check exercised one requesting member. Hosted corrupt-file rejection and a third-member capacity race were not separately exercised. Browser service fixtures and disposable PostgreSQL tests do not prove hosted Storage or email behavior.
