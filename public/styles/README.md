# Blur-style preview thumbnails

The blur-style cards in the UI ([src/components/Controls.tsx](../../src/components/Controls.tsx))
reference two images served from this folder:

| File | Card | Should show |
| --- | --- | --- |
| `gaussian.png` | "Gaussian Blur — Smooth blur" | a cropped face with a soft Gaussian blur applied |
| `pixelated.png` | "Pixelated — Pixel effect" | the same face with a coarse mosaic/pixelation applied |

Guidelines:

- **Square**, ~112×112px (rendered at 56px, 2× for retina), PNG (or WebP — if you change the
  format, update the `thumbnail` extensions in `STYLE_OPTIONS` in `Controls.tsx`).
- Keep each file small (≤ ~50 KB).

Until these files are added the cards show a neutral placeholder box (the CSS `.style-card-thumb`
fills with `--bg-elev-2`), so the layout never breaks.
