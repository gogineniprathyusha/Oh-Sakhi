# Blush watercolour background

Created October 18, 2026 for the owner-approved authentication background refinement.

- Tool: built-in `image_gen` (new background generation).
- Asset: `public/brand/blush-watercolour.webp`, 1254 × 1254, 85,702 bytes.
- Source: generated PNG, encoded to WebP at quality 85 using the existing ImageMagick WASM dependency. The original logos and artwork were not altered.
- Usage: CSS backgrounds for `.auth-intro` and `.auth-panel`, under cream overlays. The form uses the lighter overlay. Layout, text, controls and authentication behavior are unchanged.
- The original illustration uses a rectangular CSS edge mask to blend its paper background into the panel wash. Its central artwork stays opaque; the source bitmap is unchanged.

Verified on October 18, 2026: `npm run check`, **25 fixture-backed Chrome/mobile WebKit checks** and `npm run build` passed. The browser checks include auth/recovery, sampled accessibility, and layouts from 320 to 1440 pixels. Desktop/mobile screenshots were visually reviewed. No hosted writes or test emails were performed.

The subsequent edge-blending refinement passed `npm run check`, **14 fixture-backed Chrome/mobile WebKit branding/accessibility checks** and `npm run build`. Desktop and mobile screenshots were visually reviewed.

## Generation prompt

```text
Use case: stylized-concept. Asset type: a reusable raster background texture for an existing women's community website, not a UI mockup. Generate a square, high resolution, flat scanned watercolor paper texture. Warm ivory cream (#FDF6F2) paper with delicate irregular mottled blush pink watercolor washes (#FDE7E4, #F8C6CD), like diluted rose pigment blooming through damp cotton paper. Organic feathery edges, softly clouded pink pigment, tiny natural paper grain, gentle variations across the entire surface, with slightly lighter areas toward the center for readable text. Keep overall light and airy, visible watercolor character rather than a uniform smooth gradient. Pink is soft and warm, no magenta, purple, orange or blue. Full bleed edge to edge texture with no border. No objects, no flowers, no leaves, no people, no logo, no typography, no text, no symbols, no UI, no shadows, no frames, no perspective. This will be layered beneath existing logos and text; create only the empty watercolor background. Make the corners compatible with soft repeat use. Aim for a 1536x1536 square image.
```

The tool returned a 1254 × 1254 image. No resizing, recolouring or cropping was applied during encoding.
