# October 18, 2026 visual refresh

The root React application adopts the owner-supplied `her-hobby-hour/` login and home designs. That ignored local folder is preserved as a design reference, not a second application or a source of database changes. Its standalone JavaScript and historical SQL are not used by the root app.

## Identity and implementation

- Cream `#FDF6F2`, blush `#FDE7E4`, petal pink `#F8C6CD`, dusty rose `#E49CAE`, rose gold `#D4A373`, burgundy `#7A1E32` and decorative taupe `#A88F7A`.
- Playfair Display headings and DM Sans body text, using the existing Google Fonts import. Small text uses darker related shades for accessible contrast.
- `public/brand/hh-artwork.webp` is the supplied `approved-large-hh.webp`; `hh-icon.webp` is `final-hh-icon.webp`. Both are copied unchanged. The supplied floral SVG decorates the hero; authentication uses the later botanical stem described below. These assets are served by the frontend, independently of Supabase Storage.
- `src/components/Brand.tsx` shares compact branding across navigation and information pages. `src/styles/brand.css` contains the new presentation; base tokens are defined in `base.css`. Superseded auth presentation was removed from the older styles.
- Login, signup, reset and password-update views retain their handlers, labelled fields, notices, disabled states and legal links. Discovery retains real events, filters, covers, organiser photos and registration labels. Hero hosting actions use the existing login gate and event form.
- Opening login from the community now adds one browser-history entry at the same URL. Browser Back returns to discovery; Forward and reload restore the current login/signup/reset screen. Switching auth modes updates that entry, and Back to experiences consumes it. Direct recovery links are cleaned in place rather than navigating to an unrelated prior page. Only the screen name is stored in history, never form values or credentials.
- Desktop sidebar and mobile navigation retain all current destinations and permissions. Shared controls, dialogs and member pages inherit the theme without a workflow redesign.

## Login placement refinement

The owner's login previews supply the left-panel text arrangement: the Richmond community label, “It’s your time to belong.” headline, supporting copy, the original HH illustration below, and the closing community benefits. The illustration uses the existing `hh-artwork.webp` at its original proportions, without a circular crop. The owner's subsequent refinement removes the separate compact icon/wordmark header, adds centred branding beneath the illustration, and uses height-responsive artwork on desktop and a maximum illustration width of 220 pixels on mobile.

The closing tagline is replaced with three columns matching the owner’s illustrated reference: a cup with a heart above “Hobbies that heal”, a lotus above “A community that gets you”, and a heart above “A happier, you”. The row is centred at a maximum width of 520 pixels, with reduced icon and label sizes following the owner’s size adjustment. Rose outline SVGs and vertical separators scale with the layout; the text stays accessible and decorative icons are hidden from assistive technology. `AuthBenefits.tsx` supplies this row across auth modes.

The current wordmark follows `her-hobby-hour-updated-login-preview.html`: uppercase “HER HOBBY HOUR” in regular Georgia with spaced letters, followed by pink script “Oh Sakhi!”. The separate heart after the script text has been removed at the owner’s request. It uses the preview's Brush Script MT/Snell Roundhand/cursive stack, with responsive font sizes to fit the existing panels at narrow widths. The reference HTML remains outside the implementation commit; ESLint configuration is unchanged.

The right-hand form retains the previously approved design shown in the owner's screenshot: centred compact HH icon, original welcome heading, updated subtitle “Sign in to discover your next favorite experience.”, placeholder-only fields with accessible hidden labels, rounded burgundy login button and outlined account button. Its markup, control styling and alignment match the published brand-refresh implementation. Existing colours, fonts, callbacks, browser history, legal links and homepage branding are retained.

Root preview HTML files and the old `her-hobby-hour/` design folder are excluded through `.gitignore` and remain outside the implementation commit. Small-screen content follows the same reading order above the form, with reduced artwork and type sizes. No alternate circular logo asset is used.

The latest header removal, two-line wordmark typography, artwork-size refinement, illustrated benefits and login subtitle passed TypeScript/ESLint, **14 fixture-backed Chrome/mobile WebKit branding/accessibility checks**, production build and formatting checks on October 18. Desktop/mobile screenshots were reviewed. No hosted changes, emails or deployment were performed.

Login placement refinement verification on October 18, repeated after restoring the owner’s original artwork and right-hand form: TypeScript/ESLint, **37 unit tests**, **50 targeted fixture-backed browser checks** in Chrome and mobile WebKit, production build and diff formatting passed. Responsive checks cover 320, 390, 440, 800, 1024 and 1440 pixel widths, including content order and non-overlap. Screenshots were visually reviewed at desktop, tablet and mobile sizes. Authentication, accessibility, recovery and browser Back/Forward checks passed. The full browser suite was not rerun for this presentation-only refinement; no hosted writes, test emails or deployments were performed.

## Blush watercolour background

The owner requested the mottled blush texture from the logo background across the authentication panels. `public/brand/blush-watercolour.webp` is a generated, empty watercolour-paper texture in the existing cream and blush palette, encoded as an 85.7 kB WebP. The same cached asset serves both panels, with cream overlays and a lighter treatment behind the form. Logo assets, typography, positions, inputs, buttons and authentication handlers are unchanged. The texture is a CSS background and adds no interactive or accessible content.

Verified on October 18, 2026: `npm run check`, **25 fixture-backed Chrome/mobile WebKit checks** and `npm run build` passed. The browser checks include auth/recovery, sampled accessibility, and layouts from 320 to 1440 pixels. Desktop/mobile screenshots were visually reviewed. No hosted writes or test emails were performed.

The built-in image generation tool created the texture; no API key or external hosted configuration was needed. [Generation prompt and asset provenance](brand-watercolour.md).

Artwork blending follow-up on October 18: a rectangular CSS mask feathers the illustration's outer paper edges into the panel wash, removing the hard colour boundary while keeping the central artwork opaque. The original bitmap, dimensions and layout are unchanged. TypeScript/ESLint, **14 fixture-backed branding/accessibility checks** in Chrome and mobile WebKit, and the production build passed. Desktop and mobile screenshots were visually reviewed; no hosted changes or emails were performed.

## Botanical login corners

The authentication page's top-right and bottom-left flowers are replaced with a transparent botanical stem inspired by the original HH illustration: bronze leaves, rose-pink buds and blush blossoms. The same WebP is reused in both corners, with the upper one rotated. It sits behind the panel, scales with the viewport and is clipped at the page edge to prevent horizontal overflow. The homepage retains its existing floral SVG. [Asset provenance and generation prompt](brand-botanical-stem.md).

Verified October 18 after adjusting placement: TypeScript/ESLint, **14 fixture-backed Chrome/mobile WebKit branding/accessibility checks**, production build and formatting checks passed. Desktop/mobile screenshots were reviewed. No hosted changes, emails or deployment were performed.

## Desktop window fit

The desktop authentication card now uses smaller form controls, tighter spacing and viewport-height-based artwork and typography. The slightly enlarged illustration is capped at 350 pixels, or 240 pixels in windows at most 700 pixels tall; centring the full content group preserves equal outer spacing as it grows. Inputs are 48 pixels high, reduced to 44 pixels in windows at most 700 pixels tall. The original bug reproduced a 918 pixel document in a 1366 × 768 window. The desktop rules apply above 790 pixels wide; narrower screens retain the readable stacked layout and scrolling. Layout height can still grow for enlarged text or longer notices, so content remains reachable.

The login headline and supporting paragraph use the full available story width, allowing longer lines when there is room and natural wrapping on narrower screens. On desktop, the story and benefits form a vertically centred group with equal outer space above the Richmond label and below the benefit row, separated by a small responsive gap. The homepage's gap beneath the final community note is reduced to 16 pixels by removing that note's bottom margin and tightening discovery content padding. Mobile footer clearance for the fixed navigation is retained.

Regression checks cover login, signup and reset at 1440 × 900, 1366 × 768, 1280 × 720, 1024 × 768 and 1280 × 640 in Chrome and mobile WebKit. They check the complete document height, card/content bounds, equal space above the story and below the benefits, and visible legal links. These checks use local fixtures and send no emails.

Verified October 18 after the final artwork and spacing adjustments: TypeScript/ESLint, **35 targeted fixture-backed browser checks** (branding, accessibility and auth/recovery), production build, formatting checks and desktop/mobile screenshot review passed. The full browser suite was not rerun. No hosted changes, emails or deployment were performed.

The later paragraph-width and vertical-balance adjustments passed TypeScript/ESLint, **24 fixture-backed Chrome/mobile WebKit branding/accessibility checks**, production build and formatting checks. The desktop result was visually reviewed; no hosted changes or deployment were performed. The equal-spacing follow-up also passed those checks; one Chrome context timed out before application load and its targeted rerun passed.

## Verification and deployment

Browser checks use intercepted Supabase responses, not the shared live project. Coverage includes auth and recovery, publishing and attendance, event links, profiles, moderation, deletion, accessibility, branded assets and responsive layouts. Chrome and mobile WebKit cover 320, 390 and 440 pixel widths; desktop branding is checked at 1440 pixels.

`tests/browser/reference.spec.ts` optionally compares palette and typography with the supplied `home-preview.html` at desktop/mobile sizes. Set `HER_HOBBY_HOUR_DESIGN_DIR` to its containing folder if it is elsewhere. These two comparisons skip when the external reference is absent; the independent application branding and interaction tests still run.

Verified locally on October 18, 2026: `npm run check`, all **37 unit tests**, all **85 browser tests** (including both supplied-reference comparisons and mobile WebKit), `npm run build` and `git diff --check` passed. Desktop and mobile home/login screenshots were visually reviewed. No hosted writes or test emails were performed.

Browser-history follow-up on October 18: reproduced Contact → community → hosting/login → browser Back returning to Contact before the fix. After the fix, **46 targeted fixture-backed browser checks** passed in Chrome and mobile WebKit, including both hosting buttons, Back/Forward, auth-mode changes, reloads, direct recovery dismissal and event-email links. TypeScript/ESLint, all **37 unit tests**, the production build and diff formatting also passed. The full browser suite was not rerun for this follow-up; no hosted writes or emails were performed.

This is a frontend change. No migration, Edge Function deployment, Auth/SMTP setting or notification activation is required. Hosted email delivery is not exercised by the fixture checks. Publishing this feature branch is separate from merging and deploying production. No production deployment is included in this implementation.
