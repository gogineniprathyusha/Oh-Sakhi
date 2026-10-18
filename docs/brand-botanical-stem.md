# Authentication botanical stem

Created October 18, 2026 for the owner-requested replacement of the login page's outer corner flowers.

- Tool: built-in `image_gen`, using `public/brand/hh-artwork.webp` as the botanical style reference.
- Asset: `public/brand/blush-botanical-stem.webp`, 1024 × 1536, 273,718 bytes.
- Source: generated PNG encoded to WebP at quality 85 using the existing ImageMagick WASM dependency. Transparent alpha is preserved; no cropping, recolouring or background compositing was applied.
- Usage: decorative CSS backgrounds on `.auth-stage::before` (bottom left) and `.auth-stage::after` (top right, rotated). They remain behind the login panel and do not receive pointer events. The homepage retains its existing floral SVG.

Verified October 18, 2026 after adjusting corner placement: `npm run check`, **14 fixture-backed Chrome/mobile WebKit branding/accessibility checks**, `npm run build` and formatting checks passed. Layouts cover 320–1440 pixels; desktop and mobile screenshots were visually reviewed. The generated PNG's alpha channel was inspected before encoding. No hosted changes, test emails or deployment were performed.

## Generation prompt

```text
Use case: background-extraction.
Asset type: transparent botanical corner ornament for the existing Her Hobby Hour login page.
Input image: reference for the botanical stem on the LEFT of the HH logo only; the existing logo is not an edit target.
Primary request: create a standalone tall graceful botanical stem closely matching the left floral branch in this reference: slender curving warm bronze stems, long pointed pink and copper/bronze leaves with fine delicate veins, little round rose-pink berry buds on fine offshoots, and two soft blush pink layered blossoms with tiny gold stamens. Render in the same elegant dimensional satin watercolor illustration style as that branch, with luminous blush petals, warm copper shading and fine realistic details.
Composition: one airy narrow upright sprig growing from lower-left toward upper-right, length roughly three times its width; spread leaves along the curved stem. Keep the complete branch and every leaf inside the canvas, with a small transparent margin. This will be reused in opposing page corners. Match the reference palette and botanical forms.
Background: genuinely transparent alpha, including the spaces between leaves and stems. No colored paper, no watercolor backdrop, no solid color or checkerboard.
Constraints: ONLY the botanical stem, leaves, buds and blossoms. Exclude the H letters, clock, logo, circular border, woman, books, typography and all other objects. No text, no watermark, no artificial drop shadow.
```
