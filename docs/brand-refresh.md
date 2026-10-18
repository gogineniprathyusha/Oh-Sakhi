# October 18, 2026 visual refresh

The root React application adopts the owner-supplied `her-hobby-hour/` login and home designs. That untracked folder is preserved as a design reference, not a second application or a source of database changes. Its standalone JavaScript and historical SQL are not used by the root app.

## Identity and implementation

- Cream `#FDF6F2`, blush `#FDE7E4`, petal pink `#F8C6CD`, dusty rose `#E49CAE`, rose gold `#D4A373`, burgundy `#7A1E32` and decorative taupe `#A88F7A`.
- Playfair Display headings and DM Sans body text, using the existing Google Fonts import. Small text uses darker related shades for accessible contrast.
- `public/brand/hh-artwork.webp` is the supplied `approved-large-hh.webp`; `hh-icon.webp` is `final-hh-icon.webp`. Both are copied unchanged. The supplied floral SVG decorates the hero and auth background. These assets are served by the frontend, independently of Supabase Storage.
- `src/components/Brand.tsx` shares compact branding across navigation and information pages. `src/styles/brand.css` contains the new presentation; base tokens are defined in `base.css`. Superseded auth presentation was removed from the older styles.
- Login, signup, reset and password-update views retain their handlers, labelled fields, notices, disabled states and legal links. Discovery retains real events, filters, covers, organiser photos and registration labels. Hero hosting actions use the existing login gate and event form.
- Opening login from the community now adds one browser-history entry at the same URL. Browser Back returns to discovery; Forward and reload restore the current login/signup/reset screen. Switching auth modes updates that entry, and Back to experiences consumes it. Direct recovery links are cleaned in place rather than navigating to an unrelated prior page. Only the screen name is stored in history, never form values or credentials.
- Desktop sidebar and mobile navigation retain all current destinations and permissions. Shared controls, dialogs and member pages inherit the theme without a workflow redesign.

## Verification and deployment

Browser checks use intercepted Supabase responses, not the shared live project. Coverage includes auth and recovery, publishing and attendance, event links, profiles, moderation, deletion, accessibility, branded assets and responsive layouts. Chrome and mobile WebKit cover 320, 390 and 440 pixel widths; desktop branding is checked at 1440 pixels.

`tests/browser/reference.spec.ts` optionally compares palette and typography with the supplied `home-preview.html` at desktop/mobile sizes. Set `HER_HOBBY_HOUR_DESIGN_DIR` to its containing folder if it is elsewhere. These two comparisons skip when the external reference is absent; the independent application branding and interaction tests still run.

Verified locally on October 18, 2026: `npm run check`, all **37 unit tests**, all **85 browser tests** (including both supplied-reference comparisons and mobile WebKit), `npm run build` and `git diff --check` passed. Desktop and mobile home/login screenshots were visually reviewed. No hosted writes or test emails were performed.

Browser-history follow-up on October 18: reproduced Contact → community → hosting/login → browser Back returning to Contact before the fix. After the fix, **46 targeted fixture-backed browser checks** passed in Chrome and mobile WebKit, including both hosting buttons, Back/Forward, auth-mode changes, reloads, direct recovery dismissal and event-email links. TypeScript/ESLint, all **37 unit tests**, the production build and diff formatting also passed. The full browser suite was not rerun for this follow-up; no hosted writes or emails were performed.

This is a frontend change. No migration, Edge Function deployment, Auth/SMTP setting or notification activation is required. Hosted email delivery is not exercised by the fixture checks. Publishing this feature branch is separate from merging and deploying production. No production deployment is included in this implementation.
