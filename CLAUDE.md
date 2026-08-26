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

# Rebuild the self-hosted font subset (only after editing image-tools/font-charset.txt)
npm run build:font

# Checks (same ones CI runs)
npm run lint                # eslint + stylelint + html-validate
npm run check:gallery       # manifest vs files on disk (fast)
npm run check:gallery:deep  # also decodes every image with sharp
npm run check:generated     # re-runs the generator and diffs — the staleness gate
npm run test:e2e            # Playwright, serves the site itself
npm test                    # lint + check:gallery + check:generated + test:e2e
```

First-time Playwright setup: `npx playwright install chromium`.

## Adding a new photo (end-to-end flow)

1. Drop the original file into `raw-images/`
2. Run `compress.js` to create the compressed JPEG in `images/` (EXIF preserved)
3. Run `generate-gallery.js` — it reads `images/`, generates `images/optimized/<name>-{thumb,medium,large}.{jpg,webp}`, and rewrites `js/gallery-data.json`
4. Commit `images/<name>.jpg`, `images/optimized/…`, and `js/gallery-data.json`

Spaces and CJK in a filename are fine — `getVersionSrcset` percent-encodes the srcset delimiters and the rest resolves as-is. `#`, `?` and `%` are not, and `check:gallery` rejects them: they are URL delimiters, so the browser would request a different path entirely and no render-time escaping could reach every consumer.

`generate-gallery.js` is incremental — existing optimized files are skipped, so it's safe to re-run.

That skip is load bearing, not just a speed-up: **mozjpeg's output is not byte-identical between macOS and Linux**, so the regenerate-and-diff gate in CI only passes because nothing is re-encoded there. The cost is that *replacing* a photo in place leaves its old derivatives behind — `npm run check:gallery:deep` compares every derivative's height against the manifest to catch exactly that, and the fix is:

```bash
npm run build:gallery -- --force   # re-encode derivatives that already exist
```

`compress.js` auto-orients (`.rotate()`), so photos with EXIF orientation are stored upright. `generate-gallery.js` records the auto-oriented dimensions for the same reason: its derivatives are rotated, and a manifest that described a portrait shot as landscape would make the grid reserve the wrong box.

## Adding a new series (專題)

1. Name the photos with a shared prefix (e.g. `日本_…`) and run the two steps above
2. Add an entry to `image-tools/series.json`: `id`, `match` (regex on the filename), title/period/summary for the home card, `cover`, `page`, and `layout` (order + `span` of `"full"`/`"half"` + `caption` and `alt` per photo — the caption is the visible line, the alt is for screen readers and must be distinct even when two frames share a caption)
3. Re-run `npm run build:gallery` — it tags the matching photos in `js/gallery-data.json` and writes `js/series-data.json`
4. Copy `projects/japan.html` to `projects/<id>.html`, set `<body data-series="<id>" data-asset-base="../">` and rewrite the hero image + intro copy. No new JS is needed — `js/project.js` drives any series page.

`series.json` is the single source of truth for **which** photos are in a series and in what order; the hero image and intro prose live in the page itself, so each series can have its own opening. If a tagged photo is missing from `layout`, the build **warns** and appends it at the end without a caption — dropping it silently would erase it from the site, since it is excluded from the home grid too. `check:gallery` additionally rejects a `cover` that is not part of its own series (which would put that photo on the series card *and* in the home grid).

## Architecture

**Data flow at runtime:**
`js/gallery-data.json` → `GalleryDataSource.load()` → `Gallery.render()` → DOM grid → click → `Lightbox` opens and `ExifMetadataReader` formats the EXIF already carried on the manifest entry. Nothing is fetched for metadata. `Gallery` takes a `select` function that narrows/reorders the manifest for the page it is on: the home page passes `selectUngrouped`, a series page passes `selectSeriesPhotos(series)`. Whatever `select` returns is both what renders and what the lightbox pages through.

**Key files:**
- `index.html` — home page; slim sticky header, series cards, then the masonry grid of ungrouped photos; lightbox DOM is static. The **first series card is hand-written into `.series-list`**, not left to JS: it holds the LCP element, and `SeriesShowcase` only builds its copy once `main.js`'s four-deep import chain has resolved `series-data.json`. This started as a `<link rel="preload" as="image">` for the cover alone, which fixed the *download* but not the render — the bytes then sat idle ~800ms waiting for an `<img>` to exist. The whole card in the HTML fixes both and makes the preload redundant. It is a hand-maintained copy of `SeriesCardRenderer`'s output and must stay byte-identical: drift in the srcset/sizes makes the browser fetch a second file the moment `replaceChildren` swaps the card, and drift in the copy shows stale text until it does. `checkHomeCover` in `scripts/check-gallery.js` holds all of it together
- `projects/japan.html` — a series page; hero + intro are hand-written, the photo grid is generated
- `style.css` — all styles (Japanese-light theme, Cormorant Garamond uppercase headings, responsive masonry grid, series cards, series-page editorial grid, lightbox). Also carries the `@font-face` for the self-hosted font and the `.series-list` height reservation
- `fonts/` — `cormorant-garamond-subset.woff2` (13KB) plus its OFL licence. **Generated**; rebuild with `npm run build:font`, never hand-edit
- `image-tools/font-charset.txt` — the characters the subset covers. Hand-written, and the input the build reads
- `image-tools/build-font.js` — downloads the upstream variable font and subsets it
- `js/` — frontend logic as native ES modules (no build step); entry points `js/main.js` (home) and `js/project.js` (series pages), loaded with `<script type="module">`
- `js/gallery-data.json`, `js/series-data.json` — **generated files**; do not hand-edit
- `image-tools/series.json` — hand-written series definitions (the only place series membership is declared)
- `image-tools/compress.js` — compresses raw photos, outputs to `images/`
- `image-tools/generate-gallery.js` — batch-processes `images/` → `images/optimized/` + both JSON manifests

**Frontend module structure (`js/`):**
- `config.js` — `CONFIG` (selectors, paths, class names, breakpoints, event names)
- `utils.js` — shared helpers (`formatPhotoTitle`, `createElement`, srcset builders) + JSDoc typedefs. `getVersionSrcset` percent-encodes spaces and commas in every candidate URL: those two characters are srcset's own delimiters, so a filename containing one makes that candidate unparseable and the browser **drops it**. The drop is per candidate, not per element — but every tier of a photo is named after the same file, so one space invalidates *all* of them, leaving both `<source>`s empty and falling through to the `<img src>` thumb. `images/Canon R50特寫.jpg` therefore rendered at 400px on every viewport for as long as it had been on the site, with a perfectly correct-looking `srcset` attribute. CJK is deliberately left raw so the manifest and `index.html`'s hand-written cover card stay readable; `%` is left raw too, which keeps the encoding idempotent
- `gallery.js` — `GalleryDataSource` (fetches `gallery-data.json`, rebases asset paths for pages served from a subdirectory), `GalleryItemRenderer` (builds `<picture>` with WebP + JPEG `srcset`), `Gallery` (renders grid, delegates clicks via custom `gallery:open` event)
- `series.js` — `SeriesDataSource`, `SeriesCardRenderer` + `SeriesShowcase` (home-page entry cards), `ProjectItemRenderer` (`<figure>` + caption + span), and the `selectUngrouped` / `selectSeriesPhotos` selectors
- `page.js` — `mountLightbox()`, shared by both entry points (the lightbox DOM is identical on every page)
- `lightbox.js` — `LightboxView` (pure DOM manipulation), `Lightbox` (state machine; stale-request guard via `pendingImageRequestId`)
- `exif.js` — `ExifMetadataReader` (formats `item.exif` from the manifest; pure, synchronous, no network), `MetadataRenderer` (metadata grid in lightbox). **EXIF is parsed at build time**, by `exifr` in `generate-gallery.js`. The browser used to parse it itself, which meant fetching `images/<name>.jpg` — the full-resolution original, up to 3.5MB — for a photo displayed at 459KB, and again on every next/prev: paging the 5-photo japan series cost 14,271KB against 2,895KB now. Do not move this back to the client, and in particular do not point it at a derivative instead: `generate-gallery.js` strips EXIF, so the derivatives have no header to parse
- `main.js` — home page: series cards, then the ungrouped grid
- `project.js` — series pages: reads `data-series` / `data-asset-base` off `<body>`, so a new series page needs no new JS

**Verification:** `.claude/skills/verify/SKILL.md` — serve with `python3 -m http.server`, drive with Playwright + system Chrome (`channel: "chrome"`). Known noise documented there (Cloudflare CORS on localhost).

## Fonts

Cormorant Garamond is **self-hosted and subset**; there is no request to fonts.googleapis.com. This is a measured decision, not a preference:

| Variant (deployed site, Slow 4G, 4 paired runs) | LCP |
|---|---|
| As shipped with Google Fonts | 2611 ms |
| Google Fonts blocked entirely | 1947 ms |
| Identical 37KB face served from this origin | 2615 ms |
| Font cut to ~9KB | 2063 ms |

The third row is the one that matters: **removing the extra origin and its round trip bought nothing.** A webfont is fetched at High priority, which outranks images, and the 37KB lands in exactly the window where the 140KB LCP cover is downloading on a slow link. Only the byte count moves LCP, so self-hosting is only worth doing together with subsetting.

`noLayoutClosure` is what makes the subset small — 36KB → 13KB. Cormorant carries a large set of ligatures, alternates and figure styles reachable only through GSUB, and keeping the glyphs they can substitute in costs more than the outlines actually drawn. Nothing in `style.css` turns any of those features on. The `wght` axis is kept at 400–500 rather than pinned: `.series-card-title` sets no weight, inherits `body`'s 300, and lands on the axis minimum.

Adding a photo or a series whose title uses a character outside `image-tools/font-charset.txt` makes that one glyph render in the next family in the stack — a heading in two typefaces, with nothing logged. The e2e suite compares every character actually drawn in a Cormorant element against the charset file and fails naming the character; the fix is to add it and re-run `npm run build:font`.

`document.fonts.check()` cannot be used for that comparison. It answers from the `@font-face` `unicode-range`, which still spans all of ASCII, so it reports a character as present after it has been cut out of the woff2.

## The Cloudflare beacon is not the latency (measured)

`<script defer src="https://static.cloudflareinsights.com/beacon.min.js">` sits in the `<head>` of both
pages and is discovered by the preload scanner at the same moment as the LCP cover, so it looks like an
obvious thing to defer or drop. It is not. Deployed site, Slow 4G, 4 paired runs, median LCP:

| Variant | LCP | Cover done |
|---|---|---|
| As shipped | 2998 ms | 1144 ms |
| Beacon removed entirely | 2984 ms | 1127 ms |
| Beacon injected on `load` | 3092 ms | 1134 ms |

Removing it outright buys 14 ms — noise. Injecting it on `load` is *worse*, because LCP lands after
`load` here and the injection adds main-thread work right at that point.

The reason the beacon costs nothing is the same reason the modulepreload experiment below failed in the
other direction: **the cover was never the binding constraint.** Its bytes finished ~800 ms before LCP
and then sat idle, because the `<img>` that displays them did not exist until `js/main.js` →
config/page/gallery/series → lightbox/exif/utils → `series-data.json` resolved — four sequential round
trips for ~15 KB. Handing the cover 14 KB more bandwidth cannot move a render that is waiting on a
manifest.

That gap is what **hand-writing the first series card into `index.html`** closes, and it is where the
820 ms actually was. Same method, 5 paired runs, median LCP **3004 ms → 2172 ms (−832 ms)**, winning
every run with no overlap in range; CLS 0 → 0.0001, and the cover is still requested exactly once —
`replaceChildren` swaps in an identical `<picture>`, so nothing is re-fetched. The measurement was
re-run against the committed file, not the injected copy. Numbers above the table predate that change.

## Preloading the module graph does not work here (measured twice)

`js/main.js` imports config/gallery/series/page, which import utils/exif/lightbox, so the browser spends three round trips discovering files it will certainly need and only then fetches `series-data.json`. The obvious fix is a block of `<link rel="modulepreload">` plus `<link rel="preload" as="fetch" crossorigin>` for the manifests. **It makes LCP worse.** Measured on the deployed site by injecting the hints into the real HTML, with the control served through the same interception:

| | LCP | Cover image done | series-data.json |
|---|---|---|---|
| Control | 2619 ms | 2545 ms | 1879 ms |
| + 7 × modulepreload | 3015 ms | 2988 ms | 1622 ms |
| + manifest preloads | 3201 ms | 3179 ms | 1289 ms |

The hints do exactly what they promise — the manifest lands 590 ms sooner — but the 14KB they pull forward is 14KB the LCP cover no longer gets, and the cover finishes 630 ms later. On a link this slow the page is bandwidth-bound, not round-trip-bound, so moving bytes earlier only reorders which request waits.

This was tested once before the font was self-hosted, when the cover was the binding constraint, and again afterwards when the JS chain had become the binding constraint. It lost both times. The `crossorigin` on the manifest preloads is right, incidentally — without it `fetch()` requests the file a second time.

## Accessibility

**`prefers-reduced-motion` is honoured by one blanket rule over `*`**, capping `animation-duration`, `animation-iteration-count`, `transition-duration` and `scroll-behavior`. What it actually buys is the **infinite** `skeletonShimmer` and smooth scrolling; the e2e block fails if either declaration is removed.

The duration is written `0.01ms` rather than `0` by convention — it keeps `animationend` firing — and **not**, as it first appears, to stop the grid going invisible. That failure is impossible here, and it is worth knowing why before someone "simplifies" the rule: `.gallery-item` is indeed `opacity: 0` and only reaches 1 through `imageFadeIn` with `animation-fill-mode: forwards`, but `.gallery-item.loaded { opacity: 1 }` is added by JS on `img.onload`, and neither `.lightbox-img` nor `.lightbox-info` declares `opacity: 0` at rest. Measured: `animation-duration: 0s`, and even `animation: none !important`, both still leave the grid at opacity 1. The opacity assertions in the suite are kept to pin *that* coupling — delete the `.loaded` fallback and they are what notices — not because the blanket rule is one keystroke away from blanking the site.

**`.skip-link` is the first child of `<body>` on both pages and targets `<main id="main" tabindex="-1">`.** The `tabindex` is load-bearing: without it the anchor moves the scroll position but not focus, so the next Tab lands back in the nav the link just skipped. It is hidden with `transform`, never `display: none` or `visibility: hidden` — either would remove it from the tab order and defeat the point — and sits above the sticky header's `z-index: 1000`.

**Contrast**, measured with the relative-luminance formula against `--bg-color: #faf8f3`:

| Token | Before | After |
|---|---|---|
| `--text-secondary` | `#9a9085` — 2.95 ✗ | `#786e63` — 4.70 ✓ |
| `--accent-color` | `#b08d4f` — 2.92 ✗ | `#866b3c` — 4.73 ✓ |

Only lightness moved, so the palette is still warm. `--accent-soft` looks worse than both (1.97) and is **correctly left alone**: its only text uses are `.project-eyebrow` and `.project-title-dot`, which sit inside `.project-hero-overlay` — white text on a dark scrim over a photo. Darkening it to pass against the *page* background would make it dark-on-dark. Its other uses are hover `border-color`. Check where a token is actually drawn before trusting a ratio computed against the default background.

## Layout stability

`.series-list` reserves its height before JS inserts the cards, from `--series-count` (declared in `index.html`) and two custom properties. Side by side the card is exactly as tall as its cover, so the reservation is exact. **Stacked (≤1024px) the body sits below the cover** and needs `--series-card-body` on top — a measured constant (315–428px across 320–1024px), not a ratio, since it is a text-wrapping outcome. Overshooting costs dead space under the card; undershooting costs a shift, so the constants sit near the top of each range.

Getting this wrong is invisible locally: served from localhost the manifests arrive **before the first paint**, so the insertion produces no shift at all. The e2e assertion delays `js/*-data.json` by 600ms for exactly that reason — without the delay it passes with the reservation deleted outright.

Since card #1 is hand-written into `index.html`, **the shipped home page inserts nothing into `.series-list`** while there is only one series, and cannot exercise the reservation at all: delete `min-height` and both `--series-card-body` constants and every assertion stays green. The e2e therefore runs the home page twice, the second pass stripping the card out of the HTML — that is what keeps the measured constants measured until a second series exists for JS to insert. With the reservation removed it reports 0.212 desktop / 0.443 mobile at 320px.

## CI

`.github/workflows/ci.yml` runs on every push to `main`, every PR, and `workflow_dispatch`. Four parallel jobs plus a `CI passed` gate job (the one to mark required in branch protection):

| Job | What it guards |
|-----|----------------|
| `lint` | ESLint (`eslint.config.js`: `js/` = browser ESM, `image-tools/`+`scripts/` = Node CJS), Stylelint (`.stylelintrc.json`), html-validate (`.htmlvalidate.json`) |
| `gallery` | `scripts/check-gallery.js --deep` (files, dimensions, orphans, the series rules the generator does not enforce, the shape of each entry's `exif` block, plus two couplings that live outside the manifest: `checkHomeCover` ties `index.html`'s hand-written first series card to `SeriesCardRenderer` — image attributes *and* copy, and `checkGridTiers` ties `CONFIG.GRID_TIERS` to the generator's `IMAGE_SIZES` — in both directions, so the list can neither be renamed out of step nor grow `large` back) **plus `npm run check:generated`, which re-runs `generate-gallery.js` and diffs the result** (the same script `npm test` runs, so the local suite is not green on the one change the gate exists to catch) — that diff, not a hand-written comparison, is what catches a `series.json` edit committed without a rebuild. It also rejects `#`, `?` or `%` in a source filename: those are the URL's own delimiters, so unlike a space they cannot be fixed by escaping at render time — `img.src` and the hand-written cover card are written raw on purpose |
| `e2e` | `tests/gallery.spec.js` on desktop + mobile viewports: home grid count matches the ungrouped manifest entries, all images decode, every referenced asset returns 200, lightbox open/nav/close, the metadata panel matching the photo on screen (asserted per row against the manifest, on both page types) with no request to an original or to a CDN, every tile's `currentSrc` actually landing on a WebP candidate rather than the `<img src>` fallback — on the home grid, on series tiles, and on the hand-written series hero, whose `srcset` no code path escapes (these are the only assertions that read what the browser chose instead of what the attribute says), zero unexpected console errors, every character the site draws in Cormorant being present in `font-charset.txt`, and cumulative layout shift staying under 0.05 as the cards and grid arrive (the home page twice — as shipped, and with the hand-written card stripped, which is the only pass that still exercises the `.series-list` reservation) — plus, per series, one card on the home page and a series page whose photos match the layout (order, span, caption, `../`-rebased paths) |
| `lighthouse` | `.lighthouserc.json` budget on a locally served copy of the home page **and** `projects/japan.html` (performance ≥ 0.5, a11y / best-practices / SEO ≥ 0.9) |

No CD job — GitHub Pages deploys from the branch on its own.

`.github/workflows/claude-code-review.yml` runs `anthropics/claude-code-action@v1` on every non-draft PR (`opened` / `synchronize`) and posts inline + top-level review comments. Needs the `CLAUDE_CODE_OAUTH_TOKEN` repo secret; without it the job fails and the rest of CI is unaffected. It is advisory — it is not part of the `CI passed` gate.

Two things about it that cost time to work out:

- **A change to this workflow cannot be tested on a PR.** The action refuses to run when the file differs from the copy on the default branch (`Skipping action due to workflow validation`), so the job goes green in ~1.5s without reviewing anything. A green check on a PR that edits this file means nothing; the change only takes effect once merged.
- **It fails intermittently, and the CI log cannot tell you why.** PR #14 ended `is_error: true` having posted nothing, then a re-run of the same commit with the same config succeeded. Both runs had permission denials (5 and 3), so denials are not the trigger — they are not fatal. The log reports `permission_denials_count` and nothing else about what the run did, so the job now uploads `claude-execution-output.json` as an artifact on failure. Read that before theorising; a red `Review the diff` is as likely to be a flake as a finding.

Notes:
- The e2e suite starts its own `python3 -m http.server` via `playwright.config.js` (`webServer`), no manual serve needed.
- Expected console noise is filtered in `IGNORED_CONSOLE` in the spec (the Cloudflare beacon).
- `generate-gallery.js` sorts filenames by UTF-16 code unit — not `localeCompare`, whose CJK collation depends on the ICU data Node ships with — so the manifest is byte-identical across machines and Node versions. CJK filenames are compared NFC-normalised (macOS gives NFD).
- The a11y budget used to sit just above the 0.9 gate because `--text-secondary` and `--accent-color` failed WCAG AA on small text. Both were darkened; see **Accessibility** below for the values and why `--accent-soft` was deliberately left alone.
- Dependabot (`.github/dependabot.yml`) opens monthly npm + actions update PRs.
- **There is no `robots.txt`, and adding one here would do nothing.** This deploys to a GitHub Pages *project page*, so the file would be served at `/photograph-portfolio/robots.txt`; crawlers only ever fetch `/robots.txt` at the origin root, which belongs to the separate `apapp45455.github.io` repo. `sitemap.xml` is unaffected — a sitemap may live at any path that covers the URLs it lists, so it ships here and is submitted to Search Console by hand. The same applies to anything else that is origin-root-only.

**Image size tiers** (configured in `generate-gallery.js`):
| Key | Max width |
|-----|-----------|
| thumb | 400 px |
| medium | 1080 px |
| large | 1920 px |

The `<picture>` element serves WebP with JPEG fallback; `sizes` attribute targets mobile (<600 px), tablet (<1024 px), and desktop. **The lightbox included** — it served JPEG only until it was given a `<source type="image/webp">` of its own, which is the surface that matters most since it is the only one that reaches `large`. Measured on disk across the 18 photos at that tier: 7,076,457 B of JPEG against 5,080,958 B of WebP, **−28.2%**, and not one of the 18 is larger as WebP.

Two traps that cost time there:

- The lightbox builds its candidates with `getVersionSrcset`, which escapes the space and comma that are srcset's own delimiters. It used to assign `getLargestVersionUrl`'s **raw** URL straight to `source.srcset`, which made the candidate unparseable for `images/Canon R50特寫.jpg` and handed the photo to the JPEG silently. `getLargestVersionUrl` survives only on the `<img src>` fallback, where an attribute value is not tokenised and no escaping applies.
- Wrapping the lightbox `<img>` in `<picture>` makes the *picture* the flex item of `.lightbox-content-wrapper` — measured 48px wider than the photo, plus a baseline strut, which shifted the image 40px left and grew the dialog ~9px. `.lightbox-content-wrapper picture { display: contents }` hands layout back to the `<img>` and does not disturb `<source>` selection. Nothing in the suite catches this; it was found by measuring the rects.

**Not every surface offers every tier.** The home grid stops at `medium` (`CONFIG.GRID_TIERS` in `js/config.js`): a tile is 100vw on a phone, and a 3× screen computes 390 × 3 = 1170, clears 1080 and would otherwise take the 1920px file for a 390px box. Series pages (`ProjectItemRenderer`, whose `full` span really is ~1060 px wide) still reach `large`.

**The lightbox picks per viewport, and only reaches `large` on a hi-DPI desktop.** It offered exactly one candidate — the 1920px file — at every viewport until it was given a real `srcset` plus `LIGHTBOX_SIZES` in `js/lightbox.js`: a phone showing the photo 351px wide took 276KB where 102KB covers it, and paging the five-photo japan series cost 2003KB against 767KB. `LIGHTBOX_SIZES` is an upper bound rather than an exact width, because `.lightbox-img` is capped by `max-height` too (50vh stacked, 80vh side by side) and a `sizes` attribute cannot express "whichever of these binds". Over-stating it costs at most one tier; under-stating it shows a soft photo at full screen.

Two things this broke, both in the same test:

- `renders EXIF from the manifest, fetching nothing` synced on the next photo's `large.webp` arriving over the network. Pinning a tier there turns any future tier change into a timeout in a test about EXIF.
- With the tier no longer pinned, that navigation issues **no request at all** — the home grid has already loaded the same URL in the same document, so the browser reuses the decoded image. `Network.setCacheDisabled` does not change this; it is not the HTTP cache. The test now syncs on the DOM reaching photo #2 instead.

WebP is encoded at `WEBP_QUALITY: 75` / `WEBP_EFFORT: 6`, separately from `JPEG_QUALITY: 80` — sharing one number produced WebP files *larger* than the mozjpeg fallback for 10 of 54 derivatives, so `<picture>` was handing over the heavier candidate.
