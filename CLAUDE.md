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
```

There are no tests and no lint tooling configured.

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

**Image size tiers** (configured in `generate-gallery.js`):
| Key | Max width |
|-----|-----------|
| thumb | 400 px |
| medium | 1080 px |
| large | 1920 px |

The `<picture>` element serves WebP with JPEG fallback; `sizes` attribute targets mobile (<600 px), tablet (<1024 px), and desktop.
