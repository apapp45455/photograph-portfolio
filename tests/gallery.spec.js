const { test, expect } = require('@playwright/test');
const galleryData = require('../js/gallery-data.json');

/**
 * Console noise that is expected and must not fail the suite.
 * See .claude/skills/verify/SKILL.md.
 */
const IGNORED_CONSOLE = [
    /profile\.jpg/,          // intentional 404, hidden by the onerror handler
    /cloudflareinsights/,    // beacon only allows the production origin
    /static\.cloudflare/
];

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
    test('renders one item per manifest entry, all images decoded', async ({ page }) => {
        const consoleErrors = collectConsoleErrors(page);
        await page.goto('/');

        const items = page.locator('.gallery-item-wrapper');
        await expect(items).toHaveCount(galleryData.length);

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
            .poll(async () => page.locator('.gallery-item').evaluateAll(
                (nodes) => nodes.filter((img) => img.complete && img.naturalWidth > 0).length
            ), { timeout: 30_000 })
            .toBe(galleryData.length);

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
    test('opens on click with the large image and a caption', async ({ page }) => {
        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        const lightbox = page.locator('#lightbox');
        await expect(lightbox).toHaveClass(/active/);
        await expect(page.locator('#lightbox-img')).toHaveAttribute('src', /-large\.jpg$/);
        await expect(page.locator('#lightbox-caption')).not.toBeEmpty();

        // Scroll lock while open
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    });

    test('resolves EXIF metadata instead of hanging on "Loading"', async ({ page }) => {
        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        const metadata = page.locator('#lightbox-metadata');
        await expect(metadata.locator('.metadata-grid, .metadata-empty, .metadata-error'))
            .toBeVisible({ timeout: 30_000 });
        await expect(metadata).not.toContainText('Loading metadata');
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

    test('rapid navigation never leaves stale metadata behind', async ({ page }) => {
        test.skip(galleryData.length < 3, 'needs at least three photos');

        await page.goto('/');
        await page.locator('.gallery-item-wrapper').first().click();

        // Fire faster than images/EXIF can resolve — exercises pendingImageRequestId.
        for (let i = 0; i < 5; i += 1) {
            await page.keyboard.press('ArrowRight');
        }

        const metadata = page.locator('#lightbox-metadata');
        await expect(metadata.locator('.metadata-grid, .metadata-empty, .metadata-error'))
            .toBeVisible({ timeout: 30_000 });

        // Once settled, a late in-flight response must not overwrite it.
        const settled = await metadata.textContent();
        await page.waitForTimeout(2000);
        expect(await metadata.textContent()).toBe(settled);
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
