#!/usr/bin/env node
/**
 * Integrity check for the generated gallery manifest.
 *
 * Verifies that js/gallery-data.json and the files on disk agree:
 * every entry points at files that exist, every source image has an entry,
 * and images/optimized/ contains no orphans. Exits 1 on any problem.
 *
 * With --deep it also decodes every image with sharp to confirm the recorded
 * dimensions are real and the derivatives were resized to the declared width —
 * i.e. that the manifest is not stale relative to the pixels.
 *
 * Run: npm run check:gallery        (fast, filesystem only)
 *      npm run check:gallery:deep   (also decodes every image)
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
    IMAGES: 'images',
    OPTIMIZED: 'images/optimized',
    DATA: 'js/gallery-data.json',
    SERIES_SOURCE: 'image-tools/series.json',
    SERIES_DATA: 'js/series-data.json',
    SIZES: { thumb: 400, medium: 1080, large: 1920 },
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png']
};

const DEEP = process.argv.includes('--deep');

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/**
 * Unicode-normalise a path so NFD (macOS) and NFC (Linux/git) filenames compare equal.
 * The gallery uses CJK filenames, so this is not theoretical.
 */
const norm = (p) => String(p == null ? '' : p).normalize('NFC');

function listFiles(dir) {
    if (!fs.existsSync(dir)) {
        fail(`Missing directory: ${dir}`);
        return [];
    }
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
}

/**
 * Decode the actual pixels and compare them against the manifest.
 * Catches a manifest that was never regenerated after an image was replaced.
 */
async function verifyPixels(data) {
    const sharp = require('sharp');

    for (const entry of data) {
        const sourcePath = path.join(CONFIG.IMAGES, entry.filename);
        if (!fs.existsSync(sourcePath)) continue;

        try {
            const meta = await sharp(sourcePath).metadata();
            // Compare against the auto-oriented size: that is what the manifest records
            // and what the (rotated) derivatives actually are.
            const { width, height } = meta.autoOrient || meta;
            if (width !== entry.width || height !== entry.height) {
                fail(`${entry.filename}: manifest says ${entry.width}x${entry.height}, file is ${width}x${height} — run \`npm run build:gallery\``);
            }
        } catch (error) {
            fail(`${entry.filename}: unreadable image (${error.message})`);
            continue;
        }

        for (const [tier, version] of Object.entries(entry.versions || {})) {
            for (const format of ['jpg', 'webp']) {
                const filePath = version && version[format];
                if (!filePath || !fs.existsSync(filePath)) continue;
                try {
                    const meta = await sharp(filePath).metadata();
                    if (meta.width !== version.width) {
                        fail(`${filePath}: ${meta.width}px wide, manifest declares ${version.width}px (${tier})`);
                    }
                } catch (error) {
                    fail(`${filePath}: unreadable image (${error.message})`);
                }
            }
        }
    }
}

/**
 * gallery-data.json cannot go stale unnoticed because it is checked against the
 * files on disk. The series pipeline's equivalent of "the files on disk" is the
 * hand-written image-tools/series.json — so compare the two directly. Without
 * this, editing a caption and forgetting `npm run build:gallery` ships the old
 * copy with lint, check:gallery and the whole e2e suite green (e2e derives its
 * expectations from the generated file, so it asserts the stale value).
 */
function checkSeriesFreshness(generated, data) {
    let source;
    try {
        source = JSON.parse(fs.readFileSync(CONFIG.SERIES_SOURCE, 'utf8')).series || [];
    } catch (error) {
        fail(`${CONFIG.SERIES_SOURCE} is not valid JSON: ${error.message}`);
        return;
    }

    const stale = (msg) => fail(`${msg} — run \`npm run build:gallery\``);

    // The generator assigns first-match-wins across all definitions, so the patterns
    // have to be applied as one ordered list. Testing each in isolation reports false
    // staleness the moment two overlap — and no rebuild can clear it.
    const patterns = [];
    for (const definition of source) {
        try {
            patterns.push({ id: definition.id, pattern: new RegExp(definition.match) });
        } catch (error) {
            fail(`series "${definition.id}": match "${definition.match}" is not a valid regular expression (${error.message})`);
            return;
        }
    }

    for (const entry of data) {
        const hit = patterns.find((candidate) => candidate.pattern.test(norm(entry.filename)));
        const expected = hit ? hit.id : null;
        if ((entry.series ?? null) !== expected) {
            stale(`"${entry.filename}" is tagged ${entry.series ? `"${entry.series}"` : 'with no series'}, ${CONFIG.SERIES_SOURCE} resolves it to ${expected ? `"${expected}"` : 'no series'}`);
        }
    }

    // Copy-pasting a series block and forgetting to change `id` yields two identical
    // cards and duplicate DOM ids, which aria-labelledby then resolves to the first of.
    const seenIds = new Set();
    for (const definition of source) {
        if (seenIds.has(definition.id)) fail(`${CONFIG.SERIES_SOURCE}: duplicate series id "${definition.id}"`);
        seenIds.add(definition.id);

        // The id becomes part of a DOM id that aria-labelledby references, and that
        // attribute splits on whitespace — a space would silently cost the series card
        // its accessible name.
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(definition.id || ''))) {
            fail(`${CONFIG.SERIES_SOURCE}: series id "${definition.id}" must be letters, digits and hyphens (it is used as a DOM id)`);
        }
    }

    const sourceIds = source.map((entry) => entry.id);
    const generatedIds = generated.map((entry) => entry.id);
    if (sourceIds.join('\u0000') !== generatedIds.join('\u0000')) {
        stale(`${CONFIG.SERIES_DATA} has series [${generatedIds}], ${CONFIG.SERIES_SOURCE} declares [${sourceIds}]`);
        return;
    }

    source.forEach((definition, index) => {
        const built = generated[index];
        const label = `series "${definition.id}"`;

        for (const field of ['title', 'titleZh', 'period', 'summary', 'page']) {
            if (definition[field] !== built[field]) {
                stale(`${label}: ${field} is "${built[field]}" in ${CONFIG.SERIES_DATA}, "${definition[field]}" in ${CONFIG.SERIES_SOURCE}`);
            }
        }

        if (built.cover && norm(built.cover.filename) !== norm(definition.cover)) {
            stale(`${label}: cover is "${built.cover.filename}", ${CONFIG.SERIES_SOURCE} says "${definition.cover}"`);
        }

        // A layout entry that resolves to nothing is dropped at build time with a
        // warning — but CI never runs the build, so without this it is a silent no-op.
        const members = new Set(built.photos.map((photo) => norm(photo.filename)));
        const byFilename = new Map(data.map((entry) => [norm(entry.filename), entry]));

        for (const item of definition.layout || []) {
            if (!item.file) {
                fail(`${label}: a layout entry has no "file" key`);
                continue;
            }
            if (members.has(norm(item.file))) continue;

            const entry = byFilename.get(norm(item.file));
            if (!entry) {
                fail(`${label}: layout lists "${item.file}", which is not in ${CONFIG.IMAGES}/`);
            } else if (entry.series !== definition.id) {
                fail(`${label}: layout lists "${item.file}", which belongs to series "${entry.series}"`);
            } else {
                stale(`${label}: layout lists "${item.file}", missing from ${CONFIG.SERIES_DATA}`);
            }
        }

        // alt exists precisely because two frames can share a caption; a copy-pasted
        // layout block would otherwise reintroduce two identically-named buttons.
        const seenAlts = new Map();
        for (const item of definition.layout || []) {
            if (!item.alt) continue;
            const first = seenAlts.get(item.alt);
            if (first) fail(`${label}: "${item.file}" and "${first}" share the alt text "${item.alt}"`);
            else seenAlts.set(item.alt, item.file);
        }

        const expected = (definition.layout || []).filter((item) => members.has(norm(item.file)));

        expected.forEach((item, position) => {
            const photo = built.photos[position];
            if (!photo || norm(photo.filename) !== norm(item.file)) {
                stale(`${label}: photo #${position} is "${photo ? photo.filename : '(missing)'}", ${CONFIG.SERIES_SOURCE} lays out "${item.file}"`);
                return;
            }
            const span = item.span === 'full' ? 'full' : 'half';
            if (photo.span !== span) stale(`${label}/${item.file}: span is "${photo.span}", source says "${span}"`);
            if (photo.caption !== (item.caption || '')) {
                stale(`${label}/${item.file}: caption is "${photo.caption}", source says "${item.caption || ''}"`);
            }
            if ((photo.alt || '') !== (item.alt || '')) {
                stale(`${label}/${item.file}: alt is "${photo.alt || ''}", source says "${item.alt || ''}"`);
            }
        });
    });
}

/**
 * The series manifest must stay in step with the gallery manifest: a photo tagged
 * with a series has to appear on that series' page, and every photo the page lists
 * has to exist. Otherwise a photo silently disappears from the site — it is absent
 * from the home grid *and* from the series page.
 */
function checkSeries(data) {
    const hasSource = fs.existsSync(CONFIG.SERIES_SOURCE);
    const hasOutput = fs.existsSync(CONFIG.SERIES_DATA);

    if (!hasSource) {
        if (hasOutput) warn(`${CONFIG.SERIES_DATA} exists but ${CONFIG.SERIES_SOURCE} does not`);
        return;
    }
    if (!hasOutput) {
        fail(`Missing ${CONFIG.SERIES_DATA} (run \`npm run build:gallery\`)`);
        return;
    }

    let series;
    try {
        series = JSON.parse(fs.readFileSync(CONFIG.SERIES_DATA, 'utf8'));
    } catch (error) {
        fail(`${CONFIG.SERIES_DATA} is not valid JSON: ${error.message}`);
        return;
    }
    if (!Array.isArray(series)) {
        fail(`${CONFIG.SERIES_DATA} must be an array, got ${typeof series}`);
        return;
    }

    checkSeriesFreshness(series, data);

    const knownIds = new Set(series.map((entry) => entry.id));
    const byFilename = new Map(data.map((entry) => [norm(entry.filename), entry]));

    for (const entry of data) {
        if (entry.series !== null && entry.series !== undefined && !knownIds.has(entry.series)) {
            fail(`${entry.filename}: tagged with unknown series "${entry.series}"`);
        }
    }

    for (const definition of series) {
        const label = `series "${definition.id}"`;

        if (!definition.cover) {
            fail(`${label}: has no cover photo`);
        } else if (definition.cover.series !== definition.id) {
            // The cover is looked up across the whole manifest, so a typo in `cover` or
            // `match` yields a photo that is the series' cover *and* still in the home
            // grid — the one invariant this whole layout is built on.
            fail(`${label}: cover "${definition.cover.filename}" belongs to series "${definition.cover.series}"`);
        }
        if (definition.page && !fs.existsSync(definition.page)) {
            fail(`${label}: page "${definition.page}" does not exist`);
        }

        // series-data.json embeds the cover rather than referencing it, and every other
        // check reads the copy's own fields — so a commit that misses the regenerated
        // series-data.json renders stale width/height on the home page's LCP element
        // with all four CI jobs green.
        if (definition.cover) {
            const source = data.find((entry) => norm(entry.filename) === norm(definition.cover.filename));
            if (source && JSON.stringify(source) !== JSON.stringify(definition.cover)) {
                fail(`${label}: embedded cover differs from its ${CONFIG.DATA} entry — run \`npm run build:gallery\``);
            }
        }

        const members = data.filter((entry) => entry.series === definition.id);
        if (members.length === 0) fail(`${label}: no photo matches it`);
        if (definition.count !== members.length) {
            fail(`${label}: count is ${definition.count}, ${members.length} photos are tagged with it`);
        }

        const listed = new Set();
        for (const photo of definition.photos || []) {
            const filename = norm(photo.filename);
            if (listed.has(filename)) fail(`${label}: "${photo.filename}" is listed twice`);
            listed.add(filename);

            const entry = byFilename.get(filename);
            if (!entry) {
                fail(`${label}: lists "${photo.filename}", which has no gallery entry`);
            } else if (entry.series !== definition.id) {
                fail(`${label}: lists "${photo.filename}", which belongs to series "${entry.series}"`);
            }
            if (!['full', 'half'].includes(photo.span)) {
                fail(`${label}/${photo.filename}: span is "${photo.span}", expected "full" or "half"`);
            }
        }

        // A tagged photo that no page lists would vanish from the site entirely.
        for (const member of members) {
            if (!listed.has(norm(member.filename))) {
                fail(`${label}: "${member.filename}" is tagged with it but not laid out on the page`);
            }
        }
    }

    console.log(`Checked ${series.length} series covering ${data.filter((e) => e.series).length} photos.`);
}

async function main() {
    if (!fs.existsSync(CONFIG.DATA)) {
        fail(`Missing manifest: ${CONFIG.DATA} (run \`npm run build:gallery\`)`);
        return report();
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(CONFIG.DATA, 'utf8'));
    } catch (error) {
        fail(`${CONFIG.DATA} is not valid JSON: ${error.message}`);
        return report();
    }

    if (!Array.isArray(data)) {
        fail(`${CONFIG.DATA} must be an array, got ${typeof data}`);
        return report();
    }
    if (data.length === 0) {
        fail(`${CONFIG.DATA} is empty`);
        return report();
    }

    const sourceFiles = listFiles(CONFIG.IMAGES)
        .filter((name) => CONFIG.ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase()));
    const optimizedFiles = new Set(listFiles(CONFIG.OPTIMIZED).map(norm));

    const sourceOnDisk = new Set(sourceFiles.map(norm));
    const referencedSources = new Set();
    const referencedOptimized = new Set();
    const seenFilenames = new Set();

    data.forEach((entry, index) => {
        const label = `entry #${index} (${entry && entry.filename ? entry.filename : 'unnamed'})`;

        for (const field of ['filename', 'original', 'width', 'height', 'aspectRatio', 'versions']) {
            if (entry[field] === undefined) fail(`${label}: missing field "${field}"`);
        }
        if (!entry.filename || !entry.versions) return;

        const filename = norm(entry.filename);
        if (seenFilenames.has(filename)) fail(`${label}: duplicate filename`);
        seenFilenames.add(filename);

        // Source image
        if (!sourceOnDisk.has(filename)) {
            fail(`${label}: source image not found at ${CONFIG.IMAGES}/${entry.filename}`);
        }
        referencedSources.add(filename);

        if (norm(entry.original) !== norm(`${CONFIG.IMAGES}/${entry.filename}`)) {
            fail(`${label}: "original" is "${entry.original}", expected "${CONFIG.IMAGES}/${entry.filename}"`);
        }

        // Dimensions
        if (!Number.isInteger(entry.width) || entry.width <= 0) fail(`${label}: invalid width ${entry.width}`);
        if (!Number.isInteger(entry.height) || entry.height <= 0) fail(`${label}: invalid height ${entry.height}`);
        if (Number.isInteger(entry.width) && Number.isInteger(entry.height)) {
            const expected = entry.width / entry.height;
            if (Math.abs(entry.aspectRatio - expected) > 1e-6) {
                fail(`${label}: aspectRatio ${entry.aspectRatio} does not match ${entry.width}/${entry.height}`);
            }
        }

        // Size tiers
        for (const [tier, maxWidth] of Object.entries(CONFIG.SIZES)) {
            const version = entry.versions[tier];
            if (!version) {
                fail(`${label}: missing "${tier}" version`);
                continue;
            }

            for (const format of ['jpg', 'webp']) {
                const relPath = version[format];
                if (!relPath) {
                    fail(`${label}/${tier}: missing "${format}" path`);
                    continue;
                }
                const expectedDir = `${CONFIG.OPTIMIZED}/`;
                if (!relPath.startsWith(expectedDir)) {
                    fail(`${label}/${tier}: "${relPath}" is not inside ${expectedDir}`);
                    continue;
                }
                const basename = norm(relPath.slice(expectedDir.length));
                if (!optimizedFiles.has(basename)) {
                    fail(`${label}/${tier}: generated file not found: ${relPath}`);
                }
                referencedOptimized.add(basename);
            }

            const expectedWidth = Math.min(maxWidth, entry.width);
            if (version.width !== expectedWidth) {
                fail(`${label}/${tier}: width is ${version.width}, expected ${expectedWidth}`);
            }
        }
    });

    // Source images with no manifest entry — the gallery would silently omit them.
    for (const file of sourceOnDisk) {
        if (!referencedSources.has(file)) {
            fail(`${CONFIG.IMAGES}/${file} has no entry in ${CONFIG.DATA} (run \`npm run build:gallery\`)`);
        }
    }

    // Orphaned derivatives — dead weight in the repo, not a runtime break.
    for (const file of optimizedFiles) {
        if (!referencedOptimized.has(file)) {
            warn(`${CONFIG.OPTIMIZED}/${file} is not referenced by any entry (orphan)`);
        }
    }

    checkSeries(data);

    if (DEEP) {
        await verifyPixels(data);
    }

    console.log(`Checked ${data.length} gallery entries, ${sourceOnDisk.size} source images, ${optimizedFiles.size} generated files${DEEP ? ' (deep: pixels decoded)' : ''}.`);
    report();
}

function report() {
    for (const message of warnings) console.warn(`WARN  ${message}`);
    for (const message of errors) console.error(`ERROR ${message}`);

    if (errors.length > 0) {
        console.error(`\n${errors.length} error(s) found in the gallery manifest.`);
        process.exit(1);
    }
    console.log(`OK — gallery manifest is consistent${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
}

main().catch((error) => {
    console.error(`ERROR unexpected failure: ${error.stack || error.message}`);
    process.exit(1);
});
