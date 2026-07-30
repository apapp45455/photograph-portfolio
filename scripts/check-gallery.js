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
const norm = (p) => p.normalize('NFC');

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
            if (meta.width !== entry.width || meta.height !== entry.height) {
                fail(`${entry.filename}: manifest says ${entry.width}x${entry.height}, file is ${meta.width}x${meta.height} — run \`npm run build:gallery\``);
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
