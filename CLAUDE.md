# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static photography portfolio site (no build step, no framework). HTML/CSS/JS served directly — deployed to GitHub Pages at `https://apapp45455.github.io/photograph-portfolio/`. Cloudflare Web Analytics is embedded in `index.html`.

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

## Architecture

**Data flow at runtime:**
`js/gallery-data.json` → `GalleryDataSource.load()` → `Gallery.render()` → DOM grid → click → `Lightbox` opens with EXIF read via `exif-js` CDN library on the original image.

**Key files:**
- `index.html` — single page; slim sticky header (gallery-first editorial layout); gallery container populated by JS; lightbox DOM is static
- `style.css` — all styles (Japanese-light theme, Cormorant Garamond uppercase headings, responsive masonry grid, lightbox)
- `js/` — frontend logic as native ES modules (no build step); entry point `js/main.js` loaded with `<script type="module">`
- `js/gallery-data.json` — **generated file**, source of truth for the gallery; do not hand-edit
- `image-tools/compress.js` — compresses raw photos, outputs to `images/`
- `image-tools/generate-gallery.js` — batch-processes `images/` → `images/optimized/` + `js/gallery-data.json`

**Frontend module structure (`js/`):**
- `config.js` — `CONFIG` (selectors, paths, class names, breakpoints, event names)
- `utils.js` — shared helpers (`formatPhotoTitle`, `createElement`, srcset builders) + JSDoc typedefs
- `gallery.js` — `GalleryDataSource` (fetches `gallery-data.json`), `GalleryItemRenderer` (builds `<picture>` with WebP + JPEG `srcset`), `Gallery` (renders grid, delegates clicks via custom `gallery:open` event)
- `lightbox.js` — `LightboxView` (pure DOM manipulation), `Lightbox` (state machine; stale-request guard via `pendingImageRequestId`)
- `exif.js` — `ExifMetadataReader` (reads EXIF from original image via `exif-js` CDN global; disabled on `file:` protocol), `MetadataRenderer` (metadata grid in lightbox)
- `main.js` — `App` wires everything together on `DOMContentLoaded`

**Verification:** `.claude/skills/verify/SKILL.md` — serve with `python3 -m http.server`, drive with Playwright + system Chrome (`channel: "chrome"`). Known noise documented there (profile.jpg 404, Cloudflare CORS on localhost).

## CI

`.github/workflows/ci.yml` runs on every push to `main`, every PR, and `workflow_dispatch`. Four parallel jobs plus a `CI passed` gate job (the one to mark required in branch protection):

| Job | What it guards |
|-----|----------------|
| `lint` | ESLint (`eslint.config.js`: `js/` = browser ESM, `image-tools/`+`scripts/` = Node CJS), Stylelint (`.stylelintrc.json`), html-validate (`.htmlvalidate.json`) |
| `gallery` | `scripts/check-gallery.js --deep` — every manifest entry resolves to real files, every image in `images/` has an entry, no orphan derivatives, recorded dimensions match the actual pixels |
| `e2e` | `tests/gallery.spec.js` on desktop + mobile viewports: grid count matches the manifest, all images decode, every referenced asset returns 200, lightbox open/nav/close, EXIF resolves, stale-metadata guard, zero unexpected console errors |
| `lighthouse` | `.lighthouserc.json` budget on a locally served copy (performance ≥ 0.5, a11y / best-practices / SEO ≥ 0.9) |

No CD job — GitHub Pages deploys from the branch on its own.

`.github/workflows/claude-code-review.yml` runs `anthropics/claude-code-action@v1` on every non-draft PR (`opened` / `synchronize`) and posts inline + top-level review comments. Needs the `ANTHROPIC_API_KEY` repo secret; without it the job fails and the rest of CI is unaffected. It is advisory — it is not part of the `CI passed` gate.

Notes:
- The e2e suite starts its own `python3 -m http.server` via `playwright.config.js` (`webServer`), no manual serve needed.
- Expected console noise is filtered in `IGNORED_CONSOLE` in the spec (profile.jpg 404, Cloudflare beacon).
- `generate-gallery.js` sorts filenames so the manifest is byte-identical across macOS and Linux.
- Dependabot (`.github/dependabot.yml`) opens monthly npm + actions update PRs.

**Image size tiers** (configured in `generate-gallery.js`):
| Key | Max width |
|-----|-----------|
| thumb | 400 px |
| medium | 1080 px |
| large | 1920 px |

The `<picture>` element serves WebP with JPEG fallback; `sizes` attribute targets mobile (<600 px), tablet (<1024 px), and desktop.
