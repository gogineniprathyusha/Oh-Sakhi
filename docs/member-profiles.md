# Stage B member profiles

> Update: browser demo mode has been removed. Signed-out visitors now browse published Supabase events and sign in for account actions. Demo references below describe earlier-stage behavior and verification.

The original Stage B editor added no migrations. The October 18 custom-interest editor adds `202610180006_custom_profile_interests.sql` (local implementation; hosted rollout pending). Public profile photos now require the additive `202610180001_public_profile_photos.sql` migration; keep all previously applied migrations unchanged.

## Member experience

Signed-in members see their saved profile summary, including interest tags. **Edit profile**, at the top right of the profile box, opens the text fields, catalog checkboxes, comma-separated **Other interests** input and photo controls. Members can edit their display name, bio, city and optional neighborhood, select or enter up to twelve interests in total, and upload, replace or remove their own photo. **Save profile** returns to the summary only after a successful save; **Cancel** discards unsaved text/interest edits. Photo changes save separately when performed. The header and profile show the saved photo; initials remain available if a photo cannot load. Failed saves preserve form drafts. Changing a photo does not reset unsaved text or interests.

Interest choices come from the database, including migrated legacy choices. Custom names are trimmed and deduplicated without regard to case; catalog matches use the catalog spelling. Each new custom name allows up to 60 characters (longer legacy catalog choices remain usable), with at most twelve unique interests across both controls. A single update of the owned profile writes text fields and the interests array. The new migration validates and normalizes that array before writing; catalog matches still synchronize `member_interests` in the same transaction. Custom names stay in the protected profile array and are never inserted into the publicly readable catalog. Existing RLS and grants are preserved. A catalog failure preserves all saved interests and offers a retry; interest editing becomes available after the catalog loads, while other fields remain editable.

There is no demo profile editor.

## Custom-interest rollout — October 18, 2026

This work stays on `feature/hh-brand-refresh` at the owner’s request. Apply only `supabase/migrations/202610180006_custom_profile_interests.sql` once, after reconciling the shared project’s migration state, before deploying the updated frontend. The previous catalog-only trigger rejects new custom names until this migration is applied. No Edge Function or email configuration change is required. Existing profile rows and catalog links are untouched by migration application. The browser’s new summary is presentation only; profile data remains private.

Local verification covers clean setup, populated upgrades, trimming/deduplication, private catalog handling, cross-member/anonymous access, invalid names and combined limits with real disposable PostgreSQL. Browser verification uses intercepted service fixtures, including mobile WebKit; it is separate from hosted persistence. No shared-project SQL, hosted member writes or emails have been performed for this update.

Validation passed: `npm run check`, all 39 unit tests, all 59 isolated PostgreSQL tests, production build and `git diff --check`. The 32 profile/auth/photo browser checks passed in Chrome/mobile WebKit; after the legacy-compatibility adjustment, all 10 focused custom-interest checks passed again, including accessibility scans and desktop/mobile screenshot review. These overlapping browser runs are fixture checks, not live Supabase verification.

## Public profile photos

The UI accepts JPEG, PNG and WebP files up to 2 MiB. Before upload, it checks size, declared MIME type and file signature, decodes the image, rejects images above 25 million pixels, and re-encodes it with a maximum edge of 1024 pixels. Re-encoding discards source metadata. These are browser checks; a custom client can bypass them. Bucket size/MIME restrictions, owned paths, active-member checks and RLS enforce the server boundary. Server inspection of image bytes remains future upload-endpoint work.

Uploads use a new random filename under the member's UUID in the private `profile-photos` bucket, with overwrite disabled. The profile update requires the expected previous photo path, so a stale tab cannot replace a newer selection. If the write response is interrupted, the app reads the profile reference before deciding whether the upload is unused.

After linking the replacement, the app removes the previous object. Cleanup checks the current profile first and refuses to delete its active photo. An unused upload is removed when linking fails. Failed cleanup offers **Retry removal** and pauses further photo changes until it succeeds. Cleanup retries are held in page memory; closing the page during a failed cleanup may leave a private unused object for later maintenance. Profile writes and Storage operations are separate service requests, not a cross-service transaction.

Current photos are public by default, including existing uploads. Guests can see host photos on event cards/details; organisers/admins can see attendee photos in the protected attendee list. The bucket stays private: anonymous RLS allows only active members’ current referenced images, while unused, replaced and removed images remain restricted. Other profile fields stay private. Photos are downloaded using the Supabase client and displayed through local blob URLs. The app does not create public or signed photo URLs. It revokes local URLs when the application unmounts, the photo changes, or the member logs out. Blob URLs and photo bytes are not stored in demo state. Administrator access remains controlled by the existing database policies.

## Historical Stage B verification

Automated browser checks use the real Supabase SDK with intercepted service responses. They cover save/reload, catalog failures, twelve-choice limits, private downloads, upload/replacement/removal, invalid files, rejected uploads, failed linking and cleanup, concurrent edits, interrupted responses, logout and mobile layouts. Unit checks cover file signatures, sizes and owned paths. These fixtures do not substitute for a hosted Storage test.

`npm run check`, all 13 unit checks, all 39 browser checks (including 13 profile checks and both original-preview comparisons), and `npm run build` passed. The built profile page loads as a separate chunk when opened. The existing SQL migrations were unchanged; the database suite was not rerun for this frontend-only change.

Hosted checks on October 17, 2026 passed against the connected development project:

- Neighborhood and interest changes saved through the UI and survived reload.
- A test photo uploaded, displayed through an authenticated blob URL, and survived reload after replacement.
- Anonymous private-object and public-bucket reads were denied.
- Replacement and removal deleted the test objects, verified through Storage listings and uncached download requests. An earlier check using the same download URL could still see a cached response after deletion.
- The bucket rejected an SVG upload and an upload above 2 MiB, both with HTTP 400.
- The original neighborhood, interests and empty photo reference were restored and verified. All test-created images were removed and the session was logged out.

The owner entered the password directly into an isolated Chrome window. No password, session token or environment value was recorded. Only test-created photos were changed; an existing photo would have been preserved. Event-cover uploads, signed URLs and another authenticated member's hosted access were not exercised by this profile check. Existing database tests cover cross-member policy boundaries.

See [authentication-verification.md](authentication-verification.md) for the earlier authentication checks and [database.md](database.md) for schema and policy details.
