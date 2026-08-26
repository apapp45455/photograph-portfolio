const { test, expect } = require('@playwright/test');
const galleryData = require('../js/gallery-data.json');
const seriesData = require('../js/series-data.json');
const fs = require('fs');
const path = require('path');

/** The characters image-tools/font-charset.txt declares — build-font.js subsets to exactly these. */
function subsetCharacters() {
    const text = fs.readFileSync(path.join(__dirname, '..', 'image-tools', 'font-charset.txt'), 'utf8');
    const chars = new Set();
    for (const line of text.split('\n')) {
        if (line.startsWith('#')) continue;
        for (const char of line) chars.add(char);
    }
    return chars;
}

/** The home grid shows everything that is not part of a series; series pages show the rest. */
const homePhotos = galleryData.filter((entry) => !entry.series);

/**
 * Console noise that is expected and must not fail the suite.
 * See .claude/skills/verify/SKILL.md.
 */
const IGNORED_CONSOLE = [
    /cloudflareinsights/,    // beacon only allows the production origin
    /static\.cloudflare/
];

/**
 * A request that must not happen once EXIF comes off the manifest: the exif-js CDN, or
 * an original under images/. Extensions track ALLOWED_EXTENSIONS in
 * generate-gallery.js — a .png source is a legal `original`, and matching only .jpg
 * would make the regression invisible for that photo while the test still passed.
 * Deliberately not anchored with $: a cache-busting query would hide one otherwise.
 * `[^/]+` keeps derivatives out, since those live one directory deeper.
 */
function forbiddenMetadataRequest(url) {
    const target = decodeURIComponent(url);
    if (/jsdelivr|exif-js/.test(target)) return `CDN: ${target}`;
    if (/\/images\/[^/]+\.(jpe?g|png)(\?|#|$)/i.test(target)) return `original: ${target}`;
    return null;
}

/**
 * The value cell of one metadata row. Scoped deliberately: asserting on the whole
 * panel lets an ISO of 100 be satisfied by a 1/1000s shutter, and 200 by a 200mm lens.
 */
function metadataValue(metadata, label) {
    return metadata.locator(`.metadata-item:has(.label:text-is("${label}")) .value`);
}

/**
 * `currentSrc` is what the browser actually committed to, as opposed to the srcset
 * *attribute*, which looked perfect throughout the bug this guards against. Anything
 * not ending in .webp means every WebP candidate was unusable and the <img src>
 * fallback won.
 *
 * The URL is compared while still percent-encoded: the extension survives encoding
 * either way, and decodeURIComponent throws URIError on a filename containing a bare
 * `%` — the same class of "one character breaks the pipeline" failure this test exists
 * to catch, which would surface as a decode crash instead of a named photo. Only the
 * failures are decoded, and only to make the message readable.
 */
function fellBackToSrc(chosen) {
    const readable = (url) => {
        try {
            return decodeURIComponent(url);
        } catch {
            return url;
        }
    };
    return chosen
        .filter((item) => !item.src.endsWith('.webp'))
        .map((item) => ({ ...item, src: readable(item.src) }));
}

/**
 * Waits for the lightbox image to finish decoding, then reads what it settled on. The
 * selection is made against the <source> that showItem fills in the same task, so
 * reading too early can catch the element between the two assignments.
 *
 * One read, not a poll followed by a second evaluate: the second read is unguarded, so
 * it can describe a state that was never validated — and if currentSrc is momentarily
 * empty the caller gets undefined where it expected a tier.
 *
 * `needed` waits out .is-loading too. That class sets min-width: min(70vw, 900px), so
 * measuring through it reports the skeleton's box rather than the photo's.
 */
async function lightboxChoice(page) {
    const settled = await page.waitForFunction(() => {
        const img = document.querySelector('#lightbox-img');
        if (!img.complete || !img.naturalWidth || img.classList.contains('is-loading')) return null;
        return {
            alt: img.alt,
            src: img.currentSrc,
            needed: Math.round(img.getBoundingClientRect().width * devicePixelRatio)
        };
    }, null, { timeout: 30_000 });
    return settled.jsonValue();
}

function collectConsoleErrors(page) {
    const errors = [];
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        // Resource errors carry a generic text; the offending URL is in location().
        const subject = `${msg.text()} ${msg.location().url || ''}`;
        if (IGNORED_CONSOLE.some((pattern) => pattern.test(subject))) return;
        errors.push(subject.trim());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    return errors;
}

test.describe('gallery grid', () => {
    test('renders one item per ungrouped manifest entry, all images decoded', async ({ page }) => {
        const consoleErrors = collectConsoleErrors(page);
        await page.goto('/');

        const items = page.locator('#gallery-container .gallery-item-wrapper');
        await expect(items).toHaveCount(homePhotos.length);

        // Images are loading="lazy" — scroll the whole page so all of them start loading.
        await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
                window.scrollTo(0, y);
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Every <img> must actually decode (catches wrong paths / corrupt files).
        await expect
            .poll(async () => page.locator('#gallery-container .gallery-item').evaluateAll(
                (nodes) => nodes.filter((img) => img.complete && img.naturalWidth > 0).length
            ), { timeout: 30_000 })
            .toBe(homePhotos.length);

        expect(consoleErrors).toEqual([]);
    });

    test('serves WebP with a JPEG fallback', async ({ page }) => {
        await page.goto('/');

        const first = page.locator('.gallery-item-wrapper').first();
        await expect(first.locator('source[type="image/webp"]')).toHaveCount(1);

        const srcset = await first.locator('source[type="image/webp"]').getAttribute('srcset');
        expect(srcset).toContain('.webp');
        expect(srcset).toMatch(/\d+w/);

        const img = first.locator('img.gallery-item');
        await expect(img).toHaveAttribute('src', /\.jpg$/);
        await expect(img).toHaveAttribute('alt', /.+/);
        await expect(img).toHaveAttribute('loading', 'lazy');
    });

    // checkGridTiers validates the CONFIG.GRID_TIERS constant; nothing there notices if
    // main.js stops passing it. Dropping that one argument sends getVersionSrcset back
    // to every tier and puts the 1920px candidate on every tile — 673KB into a 390px
    // box on a 3x phone — with the constant still correct and every other check green.
    // This asserts the rendered result instead, so any route back to `large` fails.
    test('home tiles never offer the largest tier', async ({ page }) => {
        await page.goto('/');

        // `load` does not wait on the fetch that builds the grid — a module script only
        // has to execute — so the first read has to be an auto-retrying matcher. A bare
        // count() can legitimately see 0 and fail, which is the worst shape for a guard
        // whose job is to fail only when someone drops `tiers:` from main.js.
        await expect(page.locator('#gallery-container .gallery-item-wrapper'))
            .toHaveCount(homePhotos.length);

        const sources = page.locator('.gallery-item-wrapper source');
        const count = await sources.count();
        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i += 1) {
            const srcset = await sources.nth(i).getAttribute('srcset');
            // A renamed tier yields "", and a <source> with no candidates is skipped —
            // silently dropping every tile to the 400px thumb at full width.
            expect(srcset).toBeTruthy();
            expect(srcset).not.toContain('-large.');
        }
    });

    // Every assertion above reads the srcset *attribute*, which is why a manifest path
    // with a space in it went unnoticed: `Canon R50特寫-thumb.webp 400w` is three tokens
    // where the parser wants one URL plus one descriptor, so the candidate is dropped —
    // and since every tier shares that filename, all three go, leaving both <source>
    // elements empty. Chrome skipped them and used the <img src> 400px thumb, at every
    // viewport, for the life of the site. The attribute looked perfect the whole time.
    // This reads what the browser actually committed to instead.
    test('every tile commits to a WebP candidate, not the src fallback', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#gallery-container .gallery-item-wrapper'))
            .toHaveCount(homePhotos.length);

        await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
                window.scrollTo(0, y);
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        });

        await expect
            .poll(async () => page.locator('#gallery-container .gallery-item').evaluateAll(
                (nodes) => nodes.filter((img) => img.complete && img.naturalWidth > 0).length
            ), { timeout: 30_000 })
            .toBe(homePhotos.length);

        const chosen = await page.locator('#gallery-container .gallery-item').evaluateAll(
            (nodes) => nodes.map((img) => ({ alt: img.alt, src: img.currentSrc }))
        );
        expect(fellBackToSrc(chosen), 'tiles that ignored their <source>').toEqual([]);
    });

    test('every generated file referenced by the manifest is reachable', async ({ request }) => {
        const urls = galleryData.flatMap((entry) => [
            entry.original,
            ...Object.values(entry.versions).flatMap((version) => [version.jpg, version.webp])
        ]);

        const broken = [];
        for (const url of urls) {
            const response = await request.get(`/${encodeURI(url)}`);
            if (!response.ok()) broken.push(`${response.status()} ${url}`);
        }
        expect(broken).toEqual([]);
    });
});

test.describe('lightbox', () => {
    /**
     * The lightbox offered a single candidate — the 1920px one — at every viewport, so
     * a phone showing the photo 351px wide downloaded 276KB where 102KB covers it, and
     * paging the five-photo japan series cost 2003KB instead of 767KB. Nothing noticed:
     * the WebP assertions only check that the chosen file *is* a WebP, not which tier.
     *
     * Both directions are asserted. Too small is the worse failure — a soft photo at
     * full screen defeats the point of opening it — but too large is the bug that was
     * actually shipped. The upper bound is "not the widest tier", which holds at both
     * viewports the suite runs; a hi-DPI desktop would legitimately reach it.
     */
    test('loads a candidate that fits the viewport, not always the widest', async ({ page }) => {
        await page.goto('/');
        await page.locator('.gallery-item-wrapper picture').first().click();
        await expect(page.locator('#lightbox')).toHaveClass(/active/);

        // naturalWidth is not the file's width once srcset carries w descriptors — the
        // browser reports it density-corrected, so it comes back in CSS pixels. The
        // manifest is the only place that knows how wide each tier actually is.
        const chosen = await lightboxChoice(page);
        const file = decodeURIComponent(chosen.src).split('/').pop();

        // naturalWidth is not the file's width once srcset carries w descriptors — the
        // browser reports it density-corrected, so it comes back in CSS pixels. The
        // manifest is the only place that knows how wide each tier actually is.
        const tiers = Object.values(homePhotos[0].versions);
        const served = tiers.find((version) => decodeURIComponent(version.webp).endsWith(file));
        expect(served, `${file} is not a tier of ${homePhotos[0].filename}`).toBeTruthy();

        expect(served.width, `${file} is ${served.width}px for a box needing ${chosen.needed}px`)
            .toBeGreaterThanOrEqual(chosen.needed);

        // Only meaningful if there is a tier above the one that fits. generate-gallery
        // clamps each tier to the source width, so a photo narrower than 1080 has
        // medium and large at the same width and nothing left on the table — and
        // homePhotos[0] is positional, so which photo this is changes as photos are added.
        const widest = Math.max(...tiers.map((version) => version.width));
        test.skip(tiers.filter((version) => version.width === widest).length > 1,
            `${homePhotos[0].filename} is too small to have a distinct widest tier`);
        expect(served.width, `${file} is the widest tier (${widest}px) for a box needing ${chosen.needed}px`)
            .toBeLessThan(widest);
    });

    test('opens on click with the large image and a caption', async ({ page }) => {
        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        const lightbox = page.locator('#lightbox');
        await expect(lightbox).toHaveClass(/active/);
        await expect(page.locator('#lightbox-img')).toHaveAttribute('src', /-large\.jpg$/);
        await expect(page.locator('#lightbox-caption')).not.toBeEmpty();

        // The src attribute above is the JPEG *fallback* and says nothing about what was
        // fetched. The lightbox shows the 1920px tier, the heaviest file on the site, so
        // the format it actually commits to is the whole point: read currentSrc.
        expect(fellBackToSrc([await lightboxChoice(page)]), 'the lightbox ignored its <source>').toEqual([]);

        // Scroll lock while open
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    });

    test('renders EXIF from the manifest, fetching nothing', async ({ page }) => {
        test.skip(homePhotos.length < 2, 'needs two photos to page between');
        // The panel used to be filled by exif-js parsing the header of item.original —
        // the full-resolution file, up to 3.5MB, for a photo shown at 459KB, repeated on
        // every next/prev. Both the CDN script and the original are now unreachable from
        // this path, so assert on the requests rather than only on the rendered values.
        const offenders = [];
        page.on('request', (request) => {
            const offender = forbiddenMetadataRequest(request.url());
            if (offender) offenders.push(offender);
        });

        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        // `exif: null` is legitimate output for a source with no parseable header, and
        // homePhotos[0] is positional — so guard the render half only. Skipping the
        // whole test would take the request assertion with it, and that is the point
        // of this one.
        const metadata = page.locator('#lightbox-metadata');
        if (homePhotos[0].exif) {
            await expect(metadata.locator('.metadata-grid')).toBeVisible({ timeout: 30_000 });
            await expect(metadata).toContainText('Camera');
        }

        // Proving a request did *not* happen needs something that did to sync against:
        // the grid locator is already visible from photo #1, so it resolves on the first
        // poll and offenders could be read before the request event was delivered.
        //
        // That used to be the next photo's image arriving over the network. It no longer
        // arrives at all: the lightbox picks a tier per viewport now, and the grid has
        // already loaded that same URL in this document, so the browser reuses the
        // decoded image and issues nothing. Waiting on a response hung until the test
        // timed out — a timeout in the EXIF test, for a change about image sizes.
        //
        // So sync on the DOM reaching photo #2, then on a request of our own. A fixed
        // sleep would have let a re-introduced fetch land a moment late and still pass,
        // silently; the browser dispatches in order, so once a request issued *after*
        // the navigation has come back, anything the navigation itself started has
        // already been seen.
        const next = homePhotos[1];
        const nextCandidates = Object.values(next.versions).map((version) => version.webp);

        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => page.evaluate(() => decodeURIComponent(
            document.querySelector('#lightbox-img').currentSrc)), { timeout: 15_000 })
            .toMatch(new RegExp(nextCandidates.map((url) => url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')));
        const settled = page.waitForResponse((response) => response.url().includes('after-nav'));
        await page.evaluate(() => fetch('js/gallery-data.json?after-nav'));
        await settled;

        expect(offenders).toEqual([]);
    });

    test('arrow keys and nav buttons move between photos', async ({ page }) => {
        test.skip(galleryData.length < 2, 'needs at least two photos');

        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        const image = page.locator('#lightbox-img');
        const firstSrc = await image.getAttribute('src');

        await page.keyboard.press('ArrowRight');
        await expect(image).not.toHaveAttribute('src', firstSrc);

        await page.keyboard.press('ArrowLeft');
        await expect(image).toHaveAttribute('src', firstSrc);

        await page.locator('#next-btn').click();
        await expect(image).not.toHaveAttribute('src', firstSrc);

        await page.locator('#prev-btn').click();
        await expect(image).toHaveAttribute('src', firstSrc);
    });

    test('rapid navigation leaves the panel describing the photo on screen', async ({ page }) => {
        test.skip(homePhotos.length < 3, 'needs at least three photos');

        // This used to assert the panel stopped changing, which guarded metadata
        // arriving out of order through pendingImageRequestId. That path is gone —
        // the read is synchronous against the manifest — so comparing the panel to
        // its own earlier text is now true by construction and guards nothing.
        // The property the deleted guard actually protected is that the panel
        // describes the photo being shown, so assert that against the manifest.
        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        const steps = 5;
        for (let i = 0; i < steps; i += 1) {
            await page.keyboard.press('ArrowRight');
        }

        const expected = homePhotos[steps % homePhotos.length];
        test.skip(!expected.exif, 'the landing photo has no EXIF to compare against');

        await expect(page.locator('#lightbox-img'))
            .toHaveAttribute('src', new RegExp(`${expected.versions.large.jpg.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));

        // Restated rather than reusing ExifMetadataReader, so a formatter bug fails here.
        const metadata = page.locator('#lightbox-metadata');
        await expect(metadata.locator('.metadata-grid')).toBeVisible();
        if (expected.exif.iso) {
            await expect(metadataValue(metadata, 'ISO')).toHaveText(String(expected.exif.iso));
        }
        if (expected.exif.fNumber) {
            await expect(metadataValue(metadata, 'Aperture')).toHaveText(`f/${expected.exif.fNumber.toFixed(1)}`);
        }
    });

    test('a thumbnail can be reached and opened from the keyboard', async ({ page }) => {
        await page.goto('/');

        // The control is the <img>: on a <figure> tile, role="button" would fold the
        // caption into the accessible name and drop the figure/figcaption relationship,
        // and <picture> is an inline box ARIA-in-HTML does not sanction a role on.
        const first = page.locator('#gallery-container .gallery-item-wrapper img').first();
        await expect(first).toHaveAttribute('role', 'button');

        await first.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#lightbox')).toHaveClass(/active/);
    });

    test('tabbing to a tile shows a focus ring', async ({ page }) => {
        await page.goto('/');

        // Real Tab presses, not .focus(): :focus-visible depends on the interaction
        // being a keyboard one, and a programmatic focus would pass even if the rule
        // selected an element that never takes focus.
        let ring = null;
        for (let i = 0; i < 40 && !ring; i += 1) {
            await page.keyboard.press('Tab');
            ring = await page.evaluate(() => {
                const el = document.activeElement;
                if (!el || !el.closest('#gallery-container .gallery-item-wrapper')) return null;
                const style = getComputedStyle(el);
                return {
                    focusVisible: el.matches(':focus-visible'),
                    width: style.outlineWidth,
                    outlineStyle: style.outlineStyle,
                    offset: style.outlineOffset,
                    tag: el.tagName,
                    // The ring must cover the tile, not a collapsed inline box inside it.
                    fillsTile: Math.abs(el.getBoundingClientRect().height
                        - el.closest('.gallery-item-wrapper').getBoundingClientRect().height) < 1,
                };
            });
        }

        expect(ring, 'Tab never reached a gallery tile').not.toBeNull();
        expect(ring.focusVisible).toBe(true);

        // 'solid' rather than the UA default 'auto': asserting merely that *an* outline
        // exists would pass on the browser's own ring even when our rule selects an
        // element that never takes focus.
        expect(ring.outlineStyle).toBe('solid');
        expect(parseFloat(ring.width)).toBeGreaterThan(0);

        // The tile is inside an overflow:hidden wrapper, so an outward ring is clipped.
        expect(parseFloat(ring.offset)).toBeLessThan(0);

        // …and it is drawn on the photo itself, not on a box that merely contains it.
        expect(ring.tag).toBe('IMG');
        expect(ring.fillsTile).toBe(true);
    });

    test('keeps focus inside the lightbox, and returns it on close', async ({ page }) => {
        await page.goto('/');

        const first = page.locator('#gallery-container .gallery-item-wrapper img').first();
        await first.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#lightbox')).toHaveClass(/active/);

        // aria-modal claims the rest of the page is inert; Tab must not escape it.
        for (let i = 0; i < 5; i += 1) {
            await page.keyboard.press('Tab');
            await expect
                .poll(() => page.evaluate(() => document.getElementById('lightbox').contains(document.activeElement)))
                .toBe(true);
        }

        await page.keyboard.press('Escape');
        await expect
            .poll(() => page.evaluate(() => document.activeElement.closest('.gallery-item-wrapper') !== null))
            .toBe(true);
    });

    test('closes on Escape and on backdrop click, restoring scroll', async ({ page }) => {
        await page.goto('/');
        const lightbox = page.locator('#lightbox');

        await page.locator('.gallery-item-wrapper').first().click();
        await expect(lightbox).toHaveClass(/active/);
        await page.keyboard.press('Escape');
        await expect(lightbox).not.toHaveClass(/active/);
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');

        await page.locator('.gallery-item-wrapper').first().click();
        await expect(lightbox).toHaveClass(/active/);
        await lightbox.click({ position: { x: 5, y: 5 } }); // backdrop, outside the content wrapper
        await expect(lightbox).not.toHaveClass(/active/);
    });
});

test.describe('typography and stability', () => {
    /**
     * Cormorant Garamond is self-hosted and cut to image-tools/font-charset.txt, so a
     * character the site draws but that file does not list is a silent defect: the
     * browser takes that one glyph from the next family in the stack and the heading
     * renders in two typefaces with nothing logged.
     *
     * The comparison is made here in Node against the charset file, not in the page
     * with document.fonts.check(). That API answers from the @font-face unicode-range,
     * which still spans all of ASCII — it returned true for a character deliberately
     * cut out of the built woff2, so a check built on it passes on a broken font.
     *
     * Which elements to look at is still asked of the browser rather than derived from
     * style.css: a hand-kept list of --font-heading selectors would drift the first
     * time someone adds one. CJK is excluded by design — the stack hands those to the
     * device's own face, so they are meant to come from PingFang TC, not the subset.
     */
    /**
     * The in-page assertion below only sees what the two pages it visits paint, and it
     * opens exactly one lightbox — so of the 18 filenames in the manifest, one reaches
     * it. The filename is the input to this face that changes every time a photo is
     * added (the lightbox caption is formatPhotoTitle(filename)), so it is the one that
     * most needs covering. This reads the manifests directly instead, no browser
     * involved. Only the fields that reach --font-heading: `period` and `summary`
     * render in the body face and would demand glyphs the subset need not carry.
     */
    test('every photo title and series title is in the charset', () => {
        const declared = subsetCharacters();
        const text = [
            ...galleryData.map((entry) => entry.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ')),
            ...seriesData.map((series) => series.title)
        ].join('');
        const missing = [...new Set(text)].filter((char) => !/\s/.test(char)
            && char.codePointAt(0) < 0x2e80 && !declared.has(char));
        expect(missing, `add to image-tools/font-charset.txt, then run npm run build:font: ${JSON.stringify(missing)}`)
            .toEqual([]);
    });

    for (const { name, url } of [{ name: 'home', url: '/' }, { name: 'series', url: '/projects/japan.html' }]) {
        test(`${name}: every character drawn in Cormorant is in the charset`, async ({ page }) => {
            await page.goto(url);
            await expect(page.locator('.gallery-item-wrapper').first()).toBeVisible();
            // The lightbox caption is a heading too, and its text comes from filenames.
            await page.locator('.gallery-item-wrapper picture').first().click();
            await expect(page.locator('#lightbox')).toHaveClass(/active/);

            const drawn = await page.evaluate(() => {
                const chars = new Set();
                for (const el of document.querySelectorAll('*')) {
                    if (!/^["']?Cormorant/.test(getComputedStyle(el).fontFamily)) continue;
                    for (const node of el.childNodes) {
                        if (node.nodeType !== Node.TEXT_NODE) continue;
                        for (const char of node.textContent) chars.add(char);
                    }
                }
                return [...chars];
            });
            expect(drawn.length).toBeGreaterThan(10);

            const declared = subsetCharacters();
            const missing = drawn.filter((char) => !/\s/.test(char)
                && char.codePointAt(0) < 0x2e80 && !declared.has(char));
            expect(missing, `add to image-tools/font-charset.txt, then run npm run build:font: ${JSON.stringify(missing)}`)
                .toEqual([]);
        });
    }

    /**
     * The series cards and the grid are inserted by JS, so everything below them moves
     * on arrival unless .series-list has reserved the right height. That reservation
     * used to cover the cover image only, which is exact side by side and 197px short
     * of a 572px card once the layout stacks — 0.101 of mobile CLS, past the 0.1 that
     * counts as good, and invisible to a desktop-only check.
     *
     * The manifests are delayed deliberately. Served from localhost they arrive before
     * the first paint, so the insertion produces no *shift* at all and the assertion
     * passes with the reservation removed entirely — which is exactly how this test
     * failed to have any teeth the first time it was written.
     *
     * The reservation is a measured constant, so a series with a much longer summary
     * will undershoot it again. This is the assertion that says so.
     */
    test('nothing shifts as the series cards and the grid arrive', async ({ page }) => {
        // Five widths per page, and the page list grows with series.json — each
        // iteration pays both route delays plus the settle wait, so this outgrows the
        // 30s default and would start failing as a timeout instead of as a regression.
        test.slow();

        await page.route('**/js/*-data.json', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 600));
            return route.continue();
        });
        // The font needs the same treatment, and it is this repo's problem now that it
        // is served from here: font-display: swap re-lays out every heading when it
        // lands, which from localhost is before the first paint.
        await page.route('**/*.woff2', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 600));
            return route.continue();
        });
        // Card #1 is hand-written into index.html because it holds the LCP element, so
        // the shipped home page inserts nothing into .series-list and its reservation
        // stops being exercised there — delete min-height and both --series-card-body
        // constants from style.css and every assertion below stays green. The second
        // home pass strips the card back out, which is what keeps those measured
        // constants measured until a second series exists for JS to insert.
        let stripCard = false;
        await page.route(
            (url) => url.pathname === '/' || url.pathname.endsWith('/index.html'),
            async (route) => {
                if (!stripCard) return route.continue();
                const response = await route.fetch();
                const body = (await response.text())
                    .replace(/<a\b[^>]*\bclass="series-card"[\s\S]*?<\/a>/, '');
                return route.fulfill({ response, body });
            }
        );

        await page.addInitScript(() => {
            window.__cls = 0;
            new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
            }).observe({ type: 'layout-shift', buffered: true });
        });

        // Both page types insert their content the same way, and both had a shift:
        // the home page's series band (0.101) and the series page's photo grid, which
        // pushed "Back to gallery" off screen (0.0298).
        const home = async () => {
            await expect(page.locator('.series-card')).toHaveCount(seriesData.length);
            await expect(page.locator('#gallery-container .gallery-item-wrapper'))
                .toHaveCount(homePhotos.length);
        };
        const pages = [
            { url: '/', rendered: home },
            { url: '/', rendered: home, strip: true },
            ...seriesData.map((series) => ({
                url: `/${series.page}`,
                rendered: async () => {
                    await expect(page.locator('.project-item')).toHaveCount(series.photos.length);
                }
            }))
        ];

        // The home reservation has three bands and playwright.config.js runs two
        // viewports, 1280 and 412 — so the constant covering 481-1024px, every tablet
        // and every phone in landscape, is the one no project would ever exercise.
        // Widths are driven from inside the test for that reason.
        for (const { url, rendered, strip = false } of pages) {
            stripCard = strip;
            const label = strip ? '/ (hand-written card stripped)' : url;
            for (const [width, height] of [[320, 568], [430, 932], [768, 1024], [1024, 768], [1280, 800]]) {
                await page.setViewportSize({ width, height });
                await page.goto(url);
                // Paint the shell first, or there is no "before" for a shift to measure from.
                await expect(page.locator('h1, .section-heading').first()).toBeVisible();
                await rendered();
                await page.waitForTimeout(1200);

                const cls = await page.evaluate(() => window.__cls);
                expect(cls, `${label} at ${width}px: cumulative layout shift ${cls.toFixed(4)}`)
                    .toBeLessThan(0.05);
            }
        }
    });
});

/**
 * The reduced-motion block is one blanket rule over `*`, and the single way it can go
 * wrong is silent. `.gallery-item` is `opacity: 0` and only ever reaches 1 through
 * `imageFadeIn` with `animation-fill-mode: forwards`; at `animation-duration: 0` the
 * fill mode never applies and every photo on the site stays invisible — for exactly the
 * users the rule exists to serve, with nothing logged and every other test still green.
 * `0.01ms` is what keeps it working, so these assert the *rendered* opacity rather than
 * the declaration that produced it.
 */
test.describe('reduced motion', () => {
    test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    /**
     * What this block guards, and what it does not — both measured, because the obvious
     * reading is wrong.
     *
     * The teeth are the `infinite` shimmer and `scroll-behavior`: delete either
     * declaration from the blanket rule and the third test fails on both viewports.
     * That is the vestibular hazard, and it is pinned.
     *
     * The opacity assertions are weaker than they look. The failure they were written
     * for — a blanket rule blanking the site, since `.gallery-item` is `opacity: 0` and
     * only reaches 1 through `imageFadeIn` with `animation-fill-mode: forwards` — cannot
     * happen: `.gallery-item.loaded { opacity: 1 }` is added by JS on `img.onload`, and
     * neither `.lightbox-img` nor `.lightbox-info` declares `opacity: 0` at rest, so
     * every faded element has a non-animation path to visible. Checked directly:
     * `animation-duration: 0s`, and even `animation: none !important`, both still leave
     * the grid at opacity 1. `0.01ms` rather than `0` is therefore convention here, not
     * load-bearing — it keeps `animationend` firing, which nothing on this site listens
     * for. These assertions stay because they pin that coupling: remove the `.loaded`
     * fallback while keeping the blanket rule and they are what notices.
     *
     * assertReduceIsActive is not decoration. `test.use({ reducedMotion: 'reduce' })`
     * did not reach the page — `matchMedia` reported false inside the test — and most of
     * these assertions pass without the emulation, so this block went green once while
     * testing nothing at all.
     */
    async function assertReduceIsActive(page) {
        const matches = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
        expect(matches, 'prefers-reduced-motion is not being emulated — every assertion here would pass vacuously')
            .toBe(true);
    }

    const pages = [
        { name: 'home', url: '/', photos: '#gallery-container .gallery-item', count: homePhotos.length },
        ...seriesData.map((series) => ({
            name: `series page: ${series.id}`,
            url: `/${series.page}`,
            photos: '.project-item .gallery-item',
            count: series.photos.length
        }))
    ];

    for (const { name, url, photos, count } of pages) {
        test(`${name}: every photo is still visible with animations off`, async ({ page }) => {
            await page.goto(url);
            await assertReduceIsActive(page);
            await expect(page.locator(photos)).toHaveCount(count);

            // Every tile is loading="lazy", so on the mobile viewport the ones below the
            // fold never decode and the assertion would time out rather than report
            // anything. Step down the page so all of them are actually asked for.
            await page.evaluate(async () => {
                for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
                    window.scrollTo(0, y);
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                }
            });
            // A photo that has not decoded yet is not evidence either way — the fade is
            // what would hide it, and it has not run.
            await expect.poll(() => page.evaluate((selector) => [...document.querySelectorAll(selector)]
                .every((img) => img.complete && img.naturalWidth > 0), photos)).toBe(true);

            // Polled, not read once: at 0.01ms the animation still needs a frame to tick
            // past its duration before `forwards` shows up in the computed style, so an
            // immediate read reports the `from` keyframe and fails a correct rule.
            await expect.poll(() => page.evaluate((selector) => [...document.querySelectorAll(selector)]
                .map((img) => getComputedStyle(img).opacity), photos),
            { message: `${name}: photos left transparent under prefers-reduced-motion` })
                .toEqual(Array(count).fill('1'));
        });
    }

    test('the lightbox still reveals its photo and its metadata', async ({ page }) => {
        await page.goto('/');
        await assertReduceIsActive(page);
        await page.locator('.gallery-item-wrapper').first().click();
        await expect(page.locator('#lightbox')).toHaveClass(/active/);
        await expect.poll(() => page.evaluate(() => {
            const img = document.querySelector('#lightbox-img');
            return img.complete && img.naturalWidth > 0;
        })).toBe(true);

        // Both carry .fade-in, which animates up from opacity 0 the way the grid does.
        // Polled for the same reason as the grid: the 0.01ms animation needs a frame to
        // tick past its duration before `forwards` reaches the computed style.
        await expect.poll(() => page.evaluate(() => ({
            img: getComputedStyle(document.querySelector('#lightbox-img')).opacity,
            info: getComputedStyle(document.querySelector('.lightbox-info')).opacity
        }))).toEqual({ img: '1', info: '1' });
    });

    test('the infinite shimmer stops and smooth scrolling is off', async ({ page }) => {
        await page.goto('/');
        await assertReduceIsActive(page);

        // skeletonShimmer is the site's only `infinite` animation: capped it runs once,
        // uncapped it never stops, which is the vestibular case the rule exists for.
        const shimmer = await page.evaluate(() => {
            const img = document.querySelector('#lightbox-img');
            img.classList.add('is-loading');
            const { animationName, animationIterationCount } = getComputedStyle(img);
            img.classList.remove('is-loading');
            return { animationName, animationIterationCount };
        });
        expect(shimmer.animationName, 'the shimmer rule stopped matching — this assertion no longer guards anything')
            .toContain('skeletonShimmer');
        expect(shimmer.animationIterationCount).toBe('1');

        expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))
            .toBe('auto');
    });
});

test.describe('page shell', () => {
    test('header anchors point at existing sections', async ({ page }) => {
        await page.goto('/');

        const hrefs = await page.locator('.site-nav a').evaluateAll(
            (links) => links.map((link) => link.getAttribute('href'))
        );
        expect(hrefs.length).toBeGreaterThan(0);

        for (const href of hrefs) {
            expect(href).toMatch(/^#/);
            await expect(page.locator(href)).toHaveCount(1);
        }
    });
});

test.describe('series', () => {
    test('every photo is reachable from exactly one place', () => {
        // A photo tagged with a series is dropped from the home grid, so it must be
        // laid out on that series' page — otherwise it is on the site but unreachable.
        const laidOut = new Set(seriesData.flatMap((series) => series.photos.map((p) => p.filename)));
        const grouped = galleryData.filter((entry) => entry.series);

        expect(grouped.map((entry) => entry.filename).filter((name) => !laidOut.has(name))).toEqual([]);
    });

    test('the home page shows one entry card per series', async ({ page }) => {
        await page.goto('/');

        const cards = page.locator('.series-card');
        await expect(cards).toHaveCount(seriesData.length);

        for (const [index, series] of seriesData.entries()) {
            const card = cards.nth(index);
            await expect(card).toHaveAttribute('href', series.page);
            await expect(card).toContainText(series.title);
            await expect(card).toContainText(String(series.count));
            await expect(card.locator('img')).toHaveAttribute('src', /\.jpg$/);
        }
    });

    test('a failed manifest leaves the hand-written card standing', async ({ page }) => {
        // The band used to be hidden whenever the manifest produced nothing to render,
        // which was free while .series-list was empty. It now holds the LCP card, so a
        // transient 3KB failure would blank the site's only static link to the series.
        await page.route('**/js/series-data.json', (route) => route.abort());
        await page.goto('/');

        await expect(page.locator('#series')).not.toHaveAttribute('hidden', /.*/);
        await expect(page.locator('.series-card').first()).toBeVisible();
    });
});

for (const series of seriesData) {
    test.describe(`series page: ${series.id}`, () => {
        const url = `/${series.page}`;

        test('renders the series photos in layout order, all decoded', async ({ page }) => {
            const consoleErrors = collectConsoleErrors(page);
            await page.goto(url);

            const items = page.locator('.project-item');
            await expect(items).toHaveCount(series.photos.length);

            // Paths in the manifest are root-relative; this page lives one level down.
            for (const [index, photo] of series.photos.entries()) {
                const item = items.nth(index);
                await expect(item).toHaveClass(new RegExp(`project-item--${photo.span}`));
                await expect(item.locator('img')).toHaveAttribute('src', /^\.\.\/images\//);
                if (photo.caption) await expect(item.locator('.project-caption')).toHaveText(photo.caption);
                // Hand-written alt, not the caption and not the filename: two frames can
                // share a caption, which would give two controls the same name.
                if (photo.alt) await expect(item.locator('img')).toHaveAttribute('alt', photo.alt);
            }

            await page.evaluate(async () => {
                for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
                    window.scrollTo(0, y);
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            });

            await expect
                .poll(async () => page.locator('.project-item img').evaluateAll(
                    (nodes) => nodes.filter((img) => img.complete && img.naturalWidth > 0).length
                ), { timeout: 30_000 })
                .toBe(series.photos.length);

            // Same guard as the home grid, on the other renderer: these paths go through
            // withAssetBase first, so the escaped candidate is `../images/...` here.
            const chosen = await page.locator('.project-item img').evaluateAll(
                (nodes) => nodes.map((img) => ({ alt: img.alt, src: img.currentSrc }))
            );
            expect(fellBackToSrc(chosen), 'series tiles that ignored their <source>').toEqual([]);

            expect(consoleErrors).toEqual([]);
        });

        test('the hero image loads and the page links back to the gallery', async ({ page }) => {
            await page.goto(url);

            const hero = page.locator('.project-hero img');
            await expect
                .poll(() => hero.evaluate((img) => img.complete && img.naturalWidth > 0))
                .toBe(true);

            // The hero is the one hand-written part of a series page: its paths and
            // width/height are typed in, not generated. Tie both to the manifest so a
            // re-crop or a changed `cover` cannot leave it silently stale.
            const coverBase = series.cover.filename.replace(/\.[^/.]+$/, '');
            expect(await hero.getAttribute('src')).toContain(`${coverBase}-`);

            const declared = await hero.evaluate((img) => Number(img.getAttribute('width')) / Number(img.getAttribute('height')));
            expect(declared).toBeCloseTo(series.cover.aspectRatio, 2);

            const decoded = await hero.evaluate((img) => img.naturalWidth / img.naturalHeight);
            expect(decoded).toBeCloseTo(series.cover.aspectRatio, 2);

            // The hero is the one srcset in the repo that getVersionSrcset never touches
            // — it is typed into the page — so the escaping fix cannot protect it. A
            // cover filename with a space would drop both the <source> and the <img
            // srcset>, and the src left behind is the *large* JPEG, so a phone would
            // pull 1920px. Assert on what the browser chose, not on the attribute.
            const heroChoice = await hero.evaluate((img) => ({ alt: img.alt, src: img.currentSrc }));
            expect(fellBackToSrc([heroChoice]), 'the hero ignored its <source>').toEqual([]);

            const back = page.locator('.project-back a');
            await expect(back).toHaveAttribute('href', /index\.html/);
            await back.click();
            await expect(page.locator('#gallery-container .gallery-item-wrapper').first()).toBeVisible();
        });

        test('every tile has a distinct accessible name', async ({ page }) => {
            await page.goto(url);

            const names = await page.locator('.project-item img').evaluateAll(
                (nodes) => nodes.map((img) => img.getAttribute('alt'))
            );
            expect(names.filter(Boolean)).toHaveLength(names.length);
            expect(new Set(names).size).toBe(names.length);
        });

        test('hero facts are filled from the manifest, not left hand-typed', async ({ page }) => {
            await page.goto(url);

            await expect(page.locator('[data-series-field="count"]')).toHaveText(String(series.count));
            await expect(page.locator('[data-series-field="period"]')).toContainText(series.period);
        });

        test('the caption is selectable text, not part of the control', async ({ page }) => {
            await page.goto(url);

            const captioned = page.locator('.project-item').filter({ has: page.locator('.project-caption') }).first();
            await captioned.locator('.project-caption').click();

            await expect(page.locator('#lightbox')).not.toHaveClass(/active/);
        });

        test('keeps focus inside the lightbox while it is open', async ({ page }) => {
            await page.goto(url);
            await page.locator('.project-item').first().click();
            await expect(page.locator('#lightbox')).toHaveClass(/active/);

            // aria-modal claims the rest of the page is inert; Tab must not escape it.
            for (let i = 0; i < 5; i += 1) {
                await page.keyboard.press('Tab');
                await expect
                    .poll(() => page.evaluate(() => document.getElementById('lightbox').contains(document.activeElement)))
                    .toBe(true);
            }
        });

        test('the lightbox opens on the series photos', async ({ page }) => {
            const fetched = [];
            page.on('request', (request) => {
                const offender = forbiddenMetadataRequest(request.url());
                if (offender) fetched.push(offender);
            });

            await page.goto(url);
            await page.locator('.project-item').first().click();

            const lightbox = page.locator('#lightbox');
            await expect(lightbox).toHaveClass(/active/);
            await expect(page.locator('#lightbox-img')).toHaveAttribute('src', /^\.\.\/images\/optimized\/.*-large\.jpg$/);

            // Same guard as the home page, on the rebased path: the <source> srcset is
            // built from `../images/...` here, and a broken candidate would fall back to
            // that JPEG with the attribute still looking correct.
            expect(fellBackToSrc([await lightboxChoice(page)]), 'the series lightbox ignored its <source>').toEqual([]);

            // A series photo carries an editorial caption; the lightbox must use it
            // rather than falling back to the filename.
            if (series.photos[0].caption) {
                await expect(page.locator('#lightbox-caption')).toHaveText(series.photos[0].caption);
            }

            // Every photo must announce as itself, not the static alt="Enlarged view".
            await expect(page.locator('#lightbox-img'))
                .toHaveAttribute('alt', series.photos[0].alt || series.photos[0].caption);

            // Tightened to .metadata-grid on purpose: series pages are the one path that
            // rebuilds each item (selectSeriesPhotos grafts span/caption/alt on), so they
            // are exactly where `exif` could be dropped. Accepting .metadata-empty here
            // would let that through — and the transfer win this was measured on is the
            // series page, hence the request checks too.
            // Guarded for the same reason as the home-page test: a headerless photo here
            // is data, not a regression, and `fetched` must be asserted either way.
            const metadata = page.locator('#lightbox-metadata');
            const entry = galleryData.find((item) => item.filename === series.photos[0].filename);
            if (entry && entry.exif) {
                await expect(metadata.locator('.metadata-grid')).toBeVisible({ timeout: 30_000 });
                if (entry.exif.iso) {
                    await expect(metadataValue(metadata, 'ISO')).toHaveText(String(entry.exif.iso));
                }
            }
            expect(fetched).toEqual([]);

            await page.keyboard.press('Escape');
            await expect(lightbox).not.toHaveClass(/active/);
        });
    });
}
