# Stage B member profiles

> Update: browser demo mode has been removed. Signed-out visitors now browse published Supabase events and sign in for account actions. Demo references below describe earlier-stage behavior and verification.


The original Stage B editor added no migrations. Public profile photos now require the additive `202610180001_public_profile_photos.sql` migration; keep all previously applied migrations unchanged.

## Member experience

Signed-in members can edit their display name, bio, city and optional neighborhood, select up to twelve interests from `public.interests`, and upload, replace or remove their own photo. The header and profile show the saved photo; initials remain available if a photo cannot load. Failed saves preserve form drafts. Changing a photo does not reset unsaved text or interests.

Interest choices come from the database, including migrated legacy choices. A single update of the owned profile writes text fields and the interests array; the existing database trigger validates choices and synchronizes `member_interests` in the same transaction. A catalog failure preserves saved interests and offers a retry.

Demo profiles keep their browser-only editor. They do not upload photos, contact Storage, or transfer data into real accounts.

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
