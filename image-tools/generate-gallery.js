const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * CONFIGURATION
 */
const CONFIG = {
    DIRECTORIES: {
        IMAGES: 'images',
        OPTIMIZED: 'images/optimized',
        DATA_OUTPUT: 'js/gallery-data.json',
        SERIES_SOURCE: 'image-tools/series.json',
        SERIES_OUTPUT: 'js/series-data.json'
    },
    IMAGE_SIZES: {
        thumb: 400,
        medium: 1080,
        large: 1920
    },
    QUALITY: 80,
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png'],
    CONCURRENCY: 4 // Next Level: Limit concurrent image processing to prevent OOM
};

/**
 * Handles image processing and metadata extraction during build time.
 */
class ImageProcessor {
    /**
     * Extracts basic and EXIF metadata from an image.
     * Moving this to build-time saves megabytes of user bandwidth.
     */
    static async getMetadata(filePath) {
        const image = sharp(filePath);
        const metadata = await image.metadata();

        // Derivatives are written with .rotate() (auto-orient), so the manifest must
        // record the *oriented* dimensions — otherwise an EXIF-rotated portrait shot
        // is described as landscape and the grid reserves the wrong box for it.
        const { width, height } = metadata.autoOrient || metadata;

        // Sharp exposes raw EXIF as a buffer (metadata.exif). We only store dimensions
        // for now; parsing it here (e.g. with 'exifr') would let the lightbox skip the
        // client-side exif-js read.
        return {
            width,
            height,
            aspectRatio: width / height,
            format: metadata.format,
            // You can extend this with more EXIF data using an EXIF parser library here
        };
    }

    static async process(filePath, fileName) {
        const baseName = path.parse(fileName).name;
        const metadata = await this.getMetadata(filePath);
        
        const results = {
            original: `${CONFIG.DIRECTORIES.IMAGES}/${fileName}`,
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.aspectRatio,
            versions: {}
        };

        for (const [sizeName, width] of Object.entries(CONFIG.IMAGE_SIZES)) {
            const targetWidth = Math.min(width, metadata.width);
            results.versions[sizeName] = await this.generateVersions(filePath, baseName, sizeName, targetWidth);
        }

        return results;
    }

    /**
     * A fresh clone gives every file the same checkout time, so this only fires for a
     * source that was genuinely touched after its derivative was written.
     */
    static isStale(sourcePath, outputPath) {
        if (!fs.existsSync(outputPath)) return true;
        return fs.statSync(sourcePath).mtimeMs > fs.statSync(outputPath).mtimeMs;
    }

    static async generateVersions(filePath, baseName, sizeName, targetWidth) {
        const jpgName = `${baseName}-${sizeName}.jpg`;
        const webpName = `${baseName}-${sizeName}.webp`;
        const jpgPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, jpgName);
        const webpPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, webpName);

        // Skipping on existence alone means a re-cropped photo keeps its old derivatives:
        // the manifest picks up the new dimensions while images/optimized/ still serves
        // the old frame, and nothing downstream can tell, because every tier's width is
        // min(tier, width) either way.
        if (ImageProcessor.isStale(filePath, webpPath)) {
            await sharp(filePath).rotate().resize(targetWidth).webp({ quality: CONFIG.QUALITY }).toFile(webpPath);
        }

        if (ImageProcessor.isStale(filePath, jpgPath)) {
            await sharp(filePath).rotate().resize(targetWidth).jpeg({ quality: CONFIG.QUALITY, mozjpeg: true }).toFile(jpgPath);
        }

        return {
            jpg: `${CONFIG.DIRECTORIES.OPTIMIZED}/${jpgName}`,
            webp: `${CONFIG.DIRECTORIES.OPTIMIZED}/${webpName}`,
            width: targetWidth
        };
    }
}

/**
 * Resolves which series (專題) a photo belongs to, and turns the hand-written
 * image-tools/series.json into the runtime js/series-data.json the pages fetch.
 *
 * A photo belongs to a series when its filename matches that series' `match`
 * regex. Photos that match nothing stay in the home grid ("Selected Works").
 */
class SeriesCatalog {
    /** Filenames are compared NFC-normalised: macOS hands back NFD for CJK names. */
    static norm(value) {
        return String(value).normalize('NFC');
    }

    static load() {
        if (!fs.existsSync(CONFIG.DIRECTORIES.SERIES_SOURCE)) {
            console.log('ℹ️  No series.json — every photo goes in the main grid.');
            return [];
        }

        const parsed = JSON.parse(fs.readFileSync(CONFIG.DIRECTORIES.SERIES_SOURCE, 'utf8'));
        return (parsed.series || []).map((definition) => ({
            ...definition,
            pattern: new RegExp(definition.match)
        }));
    }

    constructor(definitions) {
        this.definitions = definitions;
    }

    idFor(fileName) {
        const name = SeriesCatalog.norm(fileName);
        const match = this.definitions.find((definition) => definition.pattern.test(name));
        return match ? match.id : null;
    }

    /**
     * Builds the runtime series manifest: editorial copy plus the cover entry in
     * full, so a series card can render a <picture> without a second lookup.
     */
    build(galleryData) {
        return this.definitions.map((definition) => {
            const members = galleryData.filter((entry) => entry.series === definition.id);
            const cover = galleryData.find(
                (entry) => SeriesCatalog.norm(entry.filename) === SeriesCatalog.norm(definition.cover)
            );

            if (!cover) {
                console.warn(`\n⚠️  Series "${definition.id}": cover "${definition.cover}" is not in ${CONFIG.DIRECTORIES.IMAGES}/`);
            }

            // Resolve every layout entry to the *manifest* filename rather than the one
            // typed into series.json, so downstream joins never have to re-normalise.
            const byName = new Map(members.map((entry) => [SeriesCatalog.norm(entry.filename), entry]));

            const photos = [];
            const laidOut = new Set();

            for (const item of definition.layout || []) {
                const entry = byName.get(SeriesCatalog.norm(item.file));
                if (!entry) {
                    console.warn(`\n⚠️  Series "${definition.id}": layout lists unknown photo "${item.file}"`);
                    continue;
                }
                laidOut.add(SeriesCatalog.norm(entry.filename));
                photos.push({
                    filename: entry.filename,
                    span: item.span === 'full' ? 'full' : 'half',
                    caption: item.caption || '',
                    alt: item.alt || ''
                });
            }

            // A member missing from `layout` still gets shown — silently dropping it would
            // erase it from the site, since it is excluded from the home grid too. But it
            // lands captionless at the bottom, which is rarely what was intended: say so.
            for (const entry of members) {
                if (laidOut.has(SeriesCatalog.norm(entry.filename))) continue;
                console.warn(`\n⚠️  Series "${definition.id}": "${entry.filename}" is not in layout — appended at the end without a caption`);
                photos.push({ filename: entry.filename, span: 'half', caption: '', alt: '' });
            }

            return {
                id: definition.id,
                title: definition.title,
                titleZh: definition.titleZh,
                period: definition.period,
                summary: definition.summary,
                page: definition.page,
                count: members.length,
                cover: cover || null,
                photos
            };
        });
    }
}

/**
 * Orchestrates the gallery generation with concurrency control.
 */
class GalleryGenerator {
    static async run() {
        console.log('🚀 Starting gallery build process...');
        const startTime = Date.now();

        try {
            if (!fs.existsSync(CONFIG.DIRECTORIES.OPTIMIZED)) {
                fs.mkdirSync(CONFIG.DIRECTORIES.OPTIMIZED, { recursive: true });
            }

            // Sorted so the generated manifest is deterministic across machines
            // (readdir order differs between macOS and Linux/CI). By UTF-16 code unit,
            // not localeCompare: collation of CJK depends on the ICU data Node ships
            // with, so a Node upgrade could quietly reshuffle the grid.
            const files = fs.readdirSync(CONFIG.DIRECTORIES.IMAGES).filter(file =>
                CONFIG.ALLOWED_EXTENSIONS.includes(path.extname(file).toLowerCase())
            ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

            console.log(`📂 Processing ${files.length} images (Concurrency: ${CONFIG.CONCURRENCY})`);

            const catalog = new SeriesCatalog(SeriesCatalog.load());
            const galleryData = [];

            // Next Level: Process images in chunks to manage system resources
            for (let i = 0; i < files.length; i += CONFIG.CONCURRENCY) {
                const chunk = files.slice(i, i + CONFIG.CONCURRENCY);
                const results = await Promise.all(chunk.map(async (file) => {
                    const filePath = path.join(CONFIG.DIRECTORIES.IMAGES, file);
                    const data = await ImageProcessor.process(filePath, file);
                    process.stdout.write('.');
                    return { filename: file, series: catalog.idFor(file), ...data };
                }));
                galleryData.push(...results);
            }

            const seriesData = catalog.build(galleryData);

            fs.writeFileSync(CONFIG.DIRECTORIES.DATA_OUTPUT, JSON.stringify(galleryData, null, 2));
            fs.writeFileSync(CONFIG.DIRECTORIES.SERIES_OUTPUT, JSON.stringify(seriesData, null, 2));

            const grouped = galleryData.filter((entry) => entry.series).length;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n✨ Done in ${duration}s! ${galleryData.length} photos (${grouped} in ${seriesData.length} series).`);
            console.log(`   → ${CONFIG.DIRECTORIES.DATA_OUTPUT}`);
            console.log(`   → ${CONFIG.DIRECTORIES.SERIES_OUTPUT}`);

        } catch (error) {
            console.error('💥 Critical error:', error);
            process.exit(1);
        }
    }
}

GalleryGenerator.run();
