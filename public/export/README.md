# SmartBlur — logo & favicon assets

Drop these into your site's `public/` (or `/static/`) folder and paste the snippet below into your `<head>`.

## Files

| File | Size | Use |
|---|---|---|
| `logo-wordmark.svg` | scalable | Landing-page header / nav. "SmartBlur" lockup. Uses **Inter** — make sure Inter is loaded on the page. |
| `logo-mark.svg` | scalable | The mark alone (rounded magenta tile). Use anywhere you need just the icon. |
| `favicon.svg` | scalable | Modern browsers prefer this — crisp at any size. |
| `favicon-16.png` `-32` `-48` `-64` | 16–64px | Classic PNG favicons (rounded tile, transparent corners). |
| `apple-touch-icon.png` | 180px | iOS home-screen icon. Full-bleed magenta (Apple rounds it for you). |
| `icon-192.png` `icon-512.png` | 192 / 512px | PWA / Android. Full-bleed, `purpose: any maskable`. |
| `logo-mark-512.png` | 512px | High-res mark for OG images, app stores, etc. |
| `site.webmanifest` | — | PWA manifest referencing the two PWA icons. |

## Paste into `<head>`

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#a800b7" />
```

## Using the wordmark on the landing page

```html
<img src="/logo-wordmark.svg" alt="SmartBlur" height="32" />
```

The wordmark renders "Smart" in near-black (`oklch(0.145 0 0)`) and "Blur" in the brand magenta (`oklch(0.518 0.253 323.949)` ≈ `#a800b7`). On a dark background, swap to a reversed version (ask and I'll export one), or just use the mark + white text.

## Brand color

Primary magenta — `oklch(0.518 0.253 323.949)` = `#a800b7` (`rgb(168, 0, 183)`).
