---
name: verify
description: Verify this static photo portfolio site end-to-end in a real browser (serve + Playwright drive)
---

# Verify photograph_web

Static site, no build step. Surface = browser GUI.

## Serve

```bash
cd /path/to/photograph_web && python3 -m http.server 8931 &
```

## Drive (Playwright)

No repo-local Playwright. Install in scratchpad (`npm i playwright`), launch with system Chrome — Playwright-managed browsers are not downloaded:

```js
chromium.launch({ channel: "chrome" })
```

Flows worth driving:
1. Gallery renders: count `.gallery-item-wrapper` (should equal entries in js/gallery-data.json)
2. Click item → `#lightbox.active`, `#lightbox-img` src is a `-large.jpg`, caption set
3. EXIF metadata loads into `#lightbox-metadata` (wait until text no longer contains "Loading")
4. ArrowRight / ArrowLeft / prev-btn / next-btn navigate; rapid-fire nav must not show stale metadata (pendingImageRequestId guard)
5. Escape and backdrop click close; `document.body.style.overflow` restored to ""

## Known noise (not failures)

- `images/profile.jpg` 404 — intentional, `onerror` hides the About image
- Cloudflare beacon CORS error on localhost — beacon only allows the production origin
- Screenshots taken right after opening lightbox can catch the 0.3s fade animation mid-frame and look wrong; wait ~2s before capturing
