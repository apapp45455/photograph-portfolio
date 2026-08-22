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
    HOME_PAGE: 'index.html',
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
                    // Height too: a re-cropped source keeps the same tier width, so width
                    // alone cannot tell a stale derivative from a current one.
                    const expectedHeight = Math.round(entry.height * (version.width / entry.width));
                    if (Math.abs(meta.height - expectedHeight) > 1) {
                        fail(`${filePath}: ${meta.width}x${meta.height}, but ${entry.filename} is ${entry.width}x${entry.height} — the source was replaced; run \`npm run build:gallery -- --force\``);
                    }
                } catch (error) {
                    fail(`${filePath}: unreadable image (${error.message})`);
                }
            }
        }
    }
}

/**
 * Rules about image-tools/series.json that the generator does not enforce: an id that
 * cannot be a DOM token, two photos sharing alt text, a layout entry naming a photo
 * that is not in the series.
 *
 * Staleness is deliberately not checked here. Comparing the generated file field by
 * field means re-implementing SeriesCatalog.build() by hand, and the field list goes
 * stale the moment series.json grows one — reopening the very hole it was written to
 * close. The `gallery` CI job re-runs the generator and diffs the result instead,
 * which is exact by construction and needs no maintenance.
 */
/**
 * Space and comma are *srcset's* delimiters, and toSrcsetUrl escapes them at render time.
 * These three are the *URL's* own delimiters, and no render-time escaping reaches every
 * consumer: img.src, the lightbox src and index.html's preload are all written raw — an
 * attribute value is not tokenized, so escaping them there would be wrong.
 *
 *   a#b.jpg   the path truncates at the fragment; the browser requests images/a
 *   a?b.jpg   the tail becomes a query string; Pages serves a 404
 *   50%.jpg   opens a percent-escape, so the name no longer says whether `%20` means a
 *             space or those three literal characters, and decodeURIComponent throws on it
 *
 * (`#` and `?` are the fatal ones — verified against the URL parser. `%` survives a
 * fetch, but it makes every path ambiguous and crashes the tooling that decodes one.)
 *
 * So this is a rename-the-file guard, not an escaping one, and it belongs at the moment
 * the photo is added. That is the lesson of `Canon R50特寫.jpg`: a filename character
 * degraded the site silently for the entire life of that photo.
 */
function checkFilenameCharacters(sourceFiles) {
    for (const name of sourceFiles) {
        const bad = [...new Set(name.match(/[#?%]/g) || [])];
        if (bad.length === 0) continue;
        fail(
            `${CONFIG.IMAGES}/${name}: filename contains ${bad.map((c) => `"${c}"`).join(', ')} — `
            + 'a URL delimiter that render-time escaping cannot fix, because img.src and the '
            + 'cover preload are written raw. Rename the file and re-run `npm run build:gallery`.'
        );
    }
}

function checkSeriesSource(data) {
    let source;
    try {
        source = JSON.parse(fs.readFileSync(CONFIG.SERIES_SOURCE, 'utf8')).series || [];
    } catch (error) {
        fail(`${CONFIG.SERIES_SOURCE} is not valid JSON: ${error.message}`);
        return;
    }

    const byFilename = new Map(data.map((entry) => [norm(entry.filename), entry]));
    const seenIds = new Set();

    for (const definition of source) {
        const label = `series "${definition.id}"`;

        // Copy-pasting a series block and forgetting to change `id` yields two identical
        // cards and duplicate DOM ids, which aria-labelledby resolves to the first of.
        if (seenIds.has(definition.id)) fail(`${CONFIG.SERIES_SOURCE}: duplicate series id "${definition.id}"`);
        seenIds.add(definition.id);

        // The id becomes part of a DOM id that aria-labelledby references, and that
        // attribute splits on whitespace — a space would silently cost the series card
        // its accessible name.
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(definition.id || ''))) {
            fail(`${CONFIG.SERIES_SOURCE}: series id "${definition.id}" must be letters, digits and hyphens (it is used as a DOM id)`);
        }

        try {
            new RegExp(definition.match);
        } catch (error) {
            fail(`${label}: match "${definition.match}" is not a valid regular expression (${error.message})`);
        }

        // The generator appends a member missing from `layout` (dropping it would erase
        // the photo from the site) and only warns — inside a CI step designed to be
        // silent. Without this, a new 日本_ photo ships uncaptioned at the bottom with
        // an alt derived from its filename, and all four jobs stay green.
        const laidOut = new Set((definition.layout || []).map((item) => norm(item.file)));
        for (const entry of data) {
            if (entry.series !== definition.id || laidOut.has(norm(entry.filename))) continue;
            fail(`${label}: "${entry.filename}" belongs to it but has no layout entry — it would ship at the end without a caption`);
        }

        const seenAlts = new Map();
        for (const item of definition.layout || []) {
            if (!item.file) {
                fail(`${label}: a layout entry has no "file" key`);
                continue;
            }

            // Dropped at build time with a warning — but CI never runs the build, so
            // without this a 臺/台 typo is a silent no-op.
            const entry = byFilename.get(norm(item.file));
            if (!entry) {
                fail(`${label}: layout lists "${item.file}", which is not in ${CONFIG.IMAGES}/`);
            } else if (entry.series !== definition.id) {
                fail(`${label}: layout lists "${item.file}", which belongs to series "${entry.series || 'none'}"`);
            }

            // alt exists precisely because two frames can share a caption; a copy-pasted
            // layout block would otherwise give two tiles the same accessible name.
            // Skipping a missing one would let it fall back to the filename unnoticed.
            if (!item.alt) {
                fail(`${label}: layout entry "${item.file}" has no "alt" — it would fall back to its filename`);
                continue;
            }
            const first = seenAlts.get(item.alt);
            if (first) fail(`${label}: "${item.file}" and "${first}" share the alt text "${item.alt}"`);
            else seenAlts.set(item.alt, item.file);
        }
    }
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

    checkSeriesSource(data);

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

        // The source-level form of this rule lives in checkSeriesSource: the generator
        // always appends unlisted members, so comparing against the generated file
        // could only ever catch a hand-edit — which the regenerate-and-diff gate covers.
    }

    // index.html reserves the band's height before JS inserts the cards. It cannot read
    // the manifest, so the count is declared there — and would silently under-reserve
    // (reintroducing the shift it was added to prevent) the moment a series is added.
    if (fs.existsSync(CONFIG.HOME_PAGE)) {
        const declared = /--series-count:\s*(\d+)/.exec(fs.readFileSync(CONFIG.HOME_PAGE, 'utf8'));
        if (!declared) {
            fail(`${CONFIG.HOME_PAGE}: #series-list has no --series-count to reserve space with`);
        } else if (Number(declared[1]) !== series.length) {
            fail(`${CONFIG.HOME_PAGE}: --series-count is ${declared[1]}, ${CONFIG.SERIES_DATA} has ${series.length} series`);
        }
    }

    console.log(`Checked ${series.length} series covering ${data.filter((e) => e.series).length} photos.`);
}

/**
 * `js/` is browser ESM, but package.json declares "type": "commonjs", which switches
 * off Node's module-syntax detection — a plain `import()` of these files resolves them
 * as CJS and throws. Loading the source through a data: URL sidesteps the extension
 * lookup entirely. Safe because both files are dependency-free and touch no DOM at
 * the top level; anything with imports of its own would need a real resolver.
 */
async function loadBrowserModule(file) {
    const source = fs.readFileSync(file, 'utf8');
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

/**
 * index.html preloads the first series cover, because that <picture> is built by JS
 * after two round trips and the preload scanner would otherwise never see it.
 *
 * The filename is therefore hard-coded in a hand-written file: reorder the series or
 * swap a cover and the tag silently points at a photo that is no longer first. A
 * mismatched srcset/sizes is *worse* than no preload — the browser downloads the
 * preloaded candidate and then the one <picture> actually selects.
 */
async function checkHomePreload() {
    if (!fs.existsSync(CONFIG.HOME_PAGE) || !fs.existsSync(CONFIG.SERIES_DATA)) return;

    const html = fs.readFileSync(CONFIG.HOME_PAGE, 'utf8');

    // Selected on both attributes rather than by one regex that pins their order:
    // attribute order is not semantic, this <head> holds a second rel="preload" (the
    // font stylesheet), and a reordered tag reported as a *missing* tag would send the
    // next person hunting for something that is right there.
    const tag = (html.match(/<link\b[^>]*>/gs) || [])
        .find((link) => /\brel="preload"/.test(link) && /\bas="image"/.test(link));

    let series;
    try {
        series = JSON.parse(fs.readFileSync(CONFIG.SERIES_DATA, 'utf8'));
    } catch {
        return; // checkSeries already reported the parse failure
    }
    if (!Array.isArray(series) || series.length === 0 || !series[0] || !series[0].cover) {
        if (tag) fail(`${CONFIG.HOME_PAGE}: preloads a cover image, but ${CONFIG.SERIES_DATA} has no first cover`);
        return;
    }

    if (!tag) {
        fail(`${CONFIG.HOME_PAGE}: no <link rel="preload" as="image"> for the first series cover — its request waits on two round trips of JS`);
        return;
    }

    // imagesrcset is asserted against the WebP candidates below, so without this a
    // browser that cannot decode WebP preloads a file it can never use — and the
    // guard would still be green.
    if (!/\btype="image\/webp"/.test(tag)) {
        fail(`${CONFIG.HOME_PAGE}: the cover preload has no type="image/webp", so a browser without WebP support would fetch a candidate it cannot decode`);
    }

    const utils = await loadBrowserModule('js/utils.js');
    const { CONFIG: FRONTEND } = await loadBrowserModule('js/config.js');

    const expected = {
        imagesrcset: utils.getVersionSrcset(series[0].cover.versions, 'webp'),
        imagesizes: utils.seriesCoverSizes(FRONTEND.BREAKPOINTS),
    };

    for (const [attribute, want] of Object.entries(expected)) {
        const found = new RegExp(`\\b${attribute}="([^"]*)"`).exec(tag);
        if (!found) {
            fail(`${CONFIG.HOME_PAGE}: the cover preload has no ${attribute}`);
            continue;
        }

        // Byte-exact, deliberately not norm(): every other comparison in this file
        // joins a filesystem name to a manifest entry, where macOS handing back NFD is
        // noise. Both sides here are URLs, and Pages serves paths byte-exactly — a
        // filename pasted from Finder in NFD is a *different* URL that 404s, while
        // <picture> still fetches the NFC one from the manifest. Normalising would wave
        // through precisely the wasted LCP round trip this guard exists to prevent.
        if (found[1] === want) continue;

        const detail = norm(found[1]) === norm(want)
            ? '\n  (same characters — these differ only in Unicode normalisation, which the diff above cannot show)'
            : '';
        fail(`${CONFIG.HOME_PAGE}: preload ${attribute} is\n  ${found[1]}\nbut SeriesCardRenderer.createCover builds\n  ${want}${detail}`);
    }
}

/**
 * The home grid narrows its srcset to CONFIG.GRID_TIERS, matching tier names against
 * the manifest. getVersionSrcset filters by name, so a tier renamed in the generator
 * leaves those <source> elements with an empty srcset — and a <source> that parses to
 * zero candidates is skipped, dropping every tile to the 400px thumb at full width.
 * Nothing else notices: the files all still exist, so check:gallery and the e2e asset
 * assertions stay green while the grid quietly serves thumbnails.
 */
async function checkGridTiers(data) {
    const { CONFIG: FRONTEND } = await loadBrowserModule('js/config.js');
    const tiers = FRONTEND.GRID_TIERS;

    if (!Array.isArray(tiers) || tiers.length === 0) {
        fail('js/config.js: CONFIG.GRID_TIERS must be a non-empty array of tier names');
        return;
    }

    // Sampled from the widest original, not data[0] (whichever filename sorts first):
    // generateVersions writes min(cap, source width), so a source narrower than a cap
    // collapses that tier onto the ones above it. The widest entry is the one most
    // likely to keep every tier distinct.
    const reference = data.reduce((widest, entry) => (entry.width > widest.width ? entry : widest));
    const versions = Object.entries(reference.versions || {});
    const available = new Set(versions.map(([tier]) => tier));

    for (const tier of tiers) {
        if (!available.has(tier)) {
            fail(`js/config.js: CONFIG.GRID_TIERS names "${tier}", which ${reference.filename} does not have in ${CONFIG.DATA} (it has ${[...available].join(', ')}) — the home grid would fall back to the thumb at full width`);
        }
    }

    // The other direction, and the likelier edit: the list growing back. "The grid
    // looks soft on my 5K monitor, put large back" reinstates the regression this cap
    // exists for — a 3x phone computes 390 * 3 = 1170, clears medium, and takes the
    // 1920px file into a 390px box. Checking names-exist alone would stay green.
    // Derived from the manifest rather than hard-coding "large", so renaming the tiers
    // does not quietly disarm it.
    const byWidth = versions.slice().sort((a, b) => b[1].width - a[1].width);
    const [widest, runnerUp] = byWidth;

    // Even the widest source can tie its top two tiers. Skipping is right rather than
    // lenient: if they resolve to the same pixel width they are the same fetch, so
    // there is no oversized candidate to keep out of the grid.
    if (widest && (!runnerUp || runnerUp[1].width !== widest[1].width) && tiers.includes(widest[0])) {
        fail(`js/config.js: CONFIG.GRID_TIERS includes "${widest[0]}" (${widest[1].width}px), the widest tier there is — a 3x phone at 100vw would take it for a tile a third that size. That tier belongs to the lightbox and the series pages.`);
    }
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

    checkFilenameCharacters(sourceFiles);

    const sourceOnDisk = new Set(sourceFiles.map(norm));
    const referencedSources = new Set();
    const referencedOptimized = new Set();
    const seenFilenames = new Set();

    data.forEach((entry, index) => {
        const label = `entry #${index} (${entry && entry.filename ? entry.filename : 'unnamed'})`;

        for (const field of ['filename', 'original', 'width', 'height', 'aspectRatio', 'exif', 'versions']) {
            if (entry[field] === undefined) fail(`${label}: missing field "${field}"`);
        }
        if (!entry.filename || !entry.versions) return;

        // null is legitimate (a source with no parseable header), but a *shape* the
        // formatters do not expect renders as "--" across the whole panel with nothing
        // saying why — the manifest is the only place this can now be caught.
        if (entry.exif !== null && entry.exif !== undefined) {
            // Everything in this script accumulates through fail() so one bad entry
            // still reports every other problem — and a hand-edited manifest is exactly
            // what this block is here for. `'make' in 5` throws, so the shape has to be
            // established before anything indexes into it.
            if (typeof entry.exif !== 'object' || Array.isArray(entry.exif)) {
                fail(`${label}: exif is ${Array.isArray(entry.exif) ? 'an array' : typeof entry.exif}, expected an object or null — run \`npm run build:gallery\``);
            } else {
                const STRING_FIELDS = ['make', 'model'];
                const NUMBER_FIELDS = ['fNumber', 'exposureTime', 'iso', 'focalLength'];
                const EXIF_FIELDS = [...STRING_FIELDS, ...NUMBER_FIELDS];

                const unknown = Object.keys(entry.exif).filter((key) => !EXIF_FIELDS.includes(key));
                if (unknown.length) fail(`${label}: exif has unexpected field(s) ${unknown.join(', ')} — run \`npm run build:gallery\``);

                for (const key of EXIF_FIELDS) {
                    if (!(key in entry.exif)) {
                        fail(`${label}: exif is missing "${key}" — run \`npm run build:gallery\``);
                        continue;
                    }
                    // Types matter as much as presence: the formatters do no validation,
                    // so `iso: "high"` reaches the panel and renders as "high".
                    const value = entry.exif[key];
                    const wanted = STRING_FIELDS.includes(key) ? 'string' : 'number';
                    if (value !== null && typeof value !== wanted) {
                        fail(`${label}: exif.${key} is ${typeof value} "${value}", expected ${wanted} or null — run \`npm run build:gallery\``);
                    }
                }
            }
        }

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
    await checkHomePreload();
    await checkGridTiers(data);

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
