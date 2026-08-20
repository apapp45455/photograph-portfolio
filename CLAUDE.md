# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static photography portfolio site (no build step, no framework). HTML/CSS/JS served directly — deployed to GitHub Pages at `https://apapp45455.github.io/photograph-portfolio/`. Cloudflare Web Analytics is embedded in every page.

Two page types: `index.html` (series cards + a masonry grid of everything ungrouped) and `projects/<id>.html` (one standalone photo series, editorial layout). A photo appears in exactly one of the two — tagging it with a series removes it from the home grid.

## Commands

```bash
# Install dependencies (sharp for image processing)
npm install

# Step 1: Compress raw photos from raw-images/ → images/ (preserves EXIF)
node image-tools/compress.js raw-images/photo.jpg
node image-tools/compress.js raw-images/*.jpg   # batch

# Step 2: Generate optimized multi-size versions + gallery-data.json
npm run build:gallery
# or: node image-tools/generate-gallery.js

# Checks (same ones CI runs)
npm run lint                # eslint + stylelint + html-validate
npm run check:gallery       # manifest vs files on disk (fast)
npm run check:gallery:deep  # also decodes every image with sharp
npm run check:generated     # re-runs the generator and diffs — the staleness gate
npm run test:e2e            # Playwright, serves the site itself
npm test                    # lint + check:gallery + test:e2e
```

First-time Playwright setup: `npx playwright install chromium`.

## Adding a new photo (end-to-end flow)

1. Drop the original file into `raw-images/`
2. Run `compress.js` to create the compressed JPEG in `images/` (EXIF preserved)
3. Run `generate-gallery.js` — it reads `images/`, generates `images/optimized/<name>-{thumb,medium,large}.{jpg,webp}`, and rewrites `js/gallery-data.json`
4. Commit `images/<name>.jpg`, `images/optimized/…`, and `js/gallery-data.json`

`generate-gallery.js` is incremental — existing optimized files are skipped, so it's safe to re-run.

`compress.js` auto-orients (`.rotate()`), so photos with EXIF orientation are stored upright. `generate-gallery.js` records the auto-oriented dimensions for the same reason: its derivatives are rotated, and a manifest that described a portrait shot as landscape would make the grid reserve the wrong box.

## Adding a new series (專題)

1. Name the photos with a shared prefix (e.g. `日本_…`) and run the two steps above
2. Add an entry to `image-tools/series.json`: `id`, `match` (regex on the filename), title/period/summary for the home card, `cover`, `page`, and `layout` (order + `span` of `"full"`/`"half"` + `caption` and `alt` per photo — the caption is the visible line, the alt is for screen readers and must be distinct even when two frames share a caption)
3. Re-run `npm run build:gallery` — it tags the matching photos in `js/gallery-data.json` and writes `js/series-data.json`
4. Copy `projects/japan.html` to `projects/<id>.html`, set `<body data-series="<id>" data-asset-base="../">` and rewrite the hero image + intro copy. No new JS is needed — `js/project.js` drives any series page.

`series.json` is the single source of truth for **which** photos are in a series and in what order; the hero image and intro prose live in the page itself, so each series can have its own opening. If a tagged photo is missing from `layout`, the build **warns** and appends it at the end without a caption — dropping it silently would erase it from the site, since it is excluded from the home grid too. `check:gallery` additionally rejects a `cover` that is not part of its own series (which would put that photo on the series card *and* in the home grid).

## Architecture

**Data flow at runtime:**
`js/gallery-data.json` → `GalleryDataSource.load()` → `Gallery.render()` → DOM grid → click → `Lightbox` opens with EXIF read via `exif-js` CDN library on the original image. `Gallery` takes a `select` function that narrows/reorders the manifest for the page it is on: the home page passes `selectUngrouped`, a series page passes `selectSeriesPhotos(series)`. Whatever `select` returns is both what renders and what the lightbox pages through.

**Key files:**
- `index.html` — home page; slim sticky header, series cards, then the masonry grid of ungrouped photos; lightbox DOM is static
- `projects/japan.html` — a series page; hero + intro are hand-written, the photo grid is generated
- `style.css` — all styles (Japanese-light theme, Cormorant Garamond uppercase headings, responsive masonry grid, series cards, series-page editorial grid, lightbox)
- `js/` — frontend logic as native ES modules (no build step); entry points `js/main.js` (home) and `js/project.js` (series pages), loaded with `<script type="module">`
- `js/gallery-data.json`, `js/series-data.json` — **generated files**; do not hand-edit
- `image-tools/series.json` — hand-written series definitions (the only place series membership is declared)
- `image-tools/compress.js` — compresses raw photos, outputs to `images/`
- `image-tools/generate-gallery.js` — batch-processes `images/` → `images/optimized/` + both JSON manifests

**Frontend module structure (`js/`):**
- `config.js` — `CONFIG` (selectors, paths, class names, breakpoints, event names)
- `utils.js` — shared helpers (`formatPhotoTitle`, `createElement`, srcset builders) + JSDoc typedefs
- `gallery.js` — `GalleryDataSource` (fetches `gallery-data.json`, rebases asset paths for pages served from a subdirectory), `GalleryItemRenderer` (builds `<picture>` with WebP + JPEG `srcset`), `Gallery` (renders grid, delegates clicks via custom `gallery:open` event)
- `series.js` — `SeriesDataSource`, `SeriesCardRenderer` + `SeriesShowcase` (home-page entry cards), `ProjectItemRenderer` (`<figure>` + caption + span), and the `selectUngrouped` / `selectSeriesPhotos` selectors
- `page.js` — `mountLightbox()`, shared by both entry points (the lightbox DOM is identical on every page)
- `lightbox.js` — `LightboxView` (pure DOM manipulation), `Lightbox` (state machine; stale-request guard via `pendingImageRequestId`)
- `exif.js` — `ExifMetadataReader` (reads EXIF from original image via `exif-js` CDN global; disabled on `file:` protocol), `MetadataRenderer` (metadata grid in lightbox)
- `main.js` — home page: series cards, then the ungrouped grid
- `project.js` — series pages: reads `data-series` / `data-asset-base` off `<body>`, so a new series page needs no new JS

**Verification:** `.claude/skills/verify/SKILL.md` — serve with `python3 -m http.server`, drive with Playwright + system Chrome (`channel: "chrome"`). Known noise documented there (profile.jpg 404, Cloudflare CORS on localhost).

## CI

`.github/workflows/ci.yml` runs on every push to `main`, every PR, and `workflow_dispatch`. Four parallel jobs plus a `CI passed` gate job (the one to mark required in branch protection):

| Job | What it guards |
|-----|----------------|
| `lint` | ESLint (`eslint.config.js`: `js/` = browser ESM, `image-tools/`+`scripts/` = Node CJS), Stylelint (`.stylelintrc.json`), html-validate (`.htmlvalidate.json`) |
| `gallery` | `scripts/check-gallery.js --deep` (files, dimensions, orphans, and the series rules the generator does not enforce) **plus `npm run check:generated`, which re-runs `generate-gallery.js` and diffs the result** (the same script `npm test` runs, so the local suite is not green on the one change the gate exists to catch) — that diff, not a hand-written comparison, is what catches a `series.json` edit committed without a rebuild |
| `e2e` | `tests/gallery.spec.js` on desktop + mobile viewports: home grid count matches the ungrouped manifest entries, all images decode, every referenced asset returns 200, lightbox open/nav/close, EXIF resolves, stale-metadata guard, zero unexpected console errors — plus, per series, one card on the home page and a series page whose photos match the layout (order, span, caption, `../`-rebased paths) |
| `lighthouse` | `.lighthouserc.json` budget on a locally served copy of the home page **and** `projects/japan.html` (performance ≥ 0.5, a11y / best-practices / SEO ≥ 0.9) |

No CD job — GitHub Pages deploys from the branch on its own.

`.github/workflows/claude-code-review.yml` runs `anthropics/claude-code-action@v1` on every non-draft PR (`opened` / `synchronize`) and posts inline + top-level review comments. Needs the `ANTHROPIC_API_KEY` repo secret; without it the job fails and the rest of CI is unaffected. It is advisory — it is not part of the `CI passed` gate.

Notes:
- The e2e suite starts its own `python3 -m http.server` via `playwright.config.js` (`webServer`), no manual serve needed.
- Expected console noise is filtered in `IGNORED_CONSOLE` in the spec (profile.jpg 404, Cloudflare beacon).
- `generate-gallery.js` sorts filenames by UTF-16 code unit — not `localeCompare`, whose CJK collation depends on the ICU data Node ships with — so the manifest is byte-identical across machines and Node versions. CJK filenames are compared NFC-normalised (macOS gives NFD).
- The a11y score sits just above the 0.9 gate: the muted palette (`--text-secondary` / `--accent-color` on the warm-white background) fails WCAG AA contrast on small text. Darkening those tokens is the fix if the budget ever trips.
- Dependabot (`.github/dependabot.yml`) opens monthly npm + actions update PRs.

**Image size tiers** (configured in `generate-gallery.js`):
| Key | Max width |
|-----|-----------|
| thumb | 400 px |
| medium | 1080 px |
| large | 1920 px |

The `<picture>` element serves WebP with JPEG fallback; `sizes` attribute targets mobile (<600 px), tablet (<1024 px), and desktop.
