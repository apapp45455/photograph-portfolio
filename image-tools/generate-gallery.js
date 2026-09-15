const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const exifr = require('exifr');

/**
 * CONFIGURATION
 */
/** Re-encode derivatives that already exist — needed after a source image is replaced. */
const FORCE = process.argv.includes('--force');

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
    // The series hero is a 21:9 band of the cover — see `.project-hero img` in
    // style.css. Letting object-fit crop it at render time means downloading the 43%
    // of the frame that is then thrown away, on the one image that *is* the LCP
    // element of every series page: 140KB against 85KB at 1080w, for pixels nobody
    // sees. HERO_FOCUS_Y mirrors `object-position: center 15%` — the band has to come
    // from the same place, or the hero reframes the moment the crop ships.
    HERO_RATIO: 21 / 9,
    HERO_FOCUS_Y: 0.15,
    JPEG_QUALITY: 80,
    // WebP at the JPEG's quality number was the wrong dial: it produced files larger
    // than the mozjpeg fallback for 5 of 18 photos at medium and large, so <picture>
    // was picking the heavier candidate. 75 with a higher effort is 21% smaller across
    // the set and beats the JPEG on every one of the 54 derivatives.
    WEBP_QUALITY: 75,
    WEBP_EFFORT: 6,
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

        return {
            width,
            height,
            aspectRatio: width / height,
            format: metadata.format,
            exif: await this.getExif(filePath),
        };
    }

    /**
     * The five values the lightbox shows, parsed once here instead of by the browser.
     *
     * The client used to fetch `images/<name>.jpg` — the full-resolution original, up
     * to 3.5MB — purely to read this header, while displaying the 459KB derivative. It
     * cannot read them from a derivative instead: generate-gallery.js strips EXIF.
     *
     * Raw values, not display strings: formatting stays in ExifMetadataReader, which is
     * where it was and where it belongs. fNumber and focalLength are rounded to 2dp,
     * which is lossless for a display that shows 1dp and 0dp; exposureTime keeps full
     * precision because the formatter inverts it.
     */
    static async getExif(filePath) {
        let tags;
        try {
            tags = await exifr.parse(filePath, ['Make', 'Model', 'FNumber', 'ExposureTime', 'ISO', 'FocalLength']);
        } catch (error) {
            // Not the headerless case — that resolves undefined and falls through below.
            // This is a header that exists and will not parse, and it is otherwise silent
            // all the way down: null is legitimate output so check-gallery accepts it, the
            // failure is deterministic so check:generated reproduces it and diffs clean,
            // and the panel says "No EXIF data found" exactly as it would for a photo that
            // genuinely has none. The build log is the only place it can surface.
            console.warn(`\n⚠️  ${path.basename(filePath)}: EXIF present but unreadable (${error.message}) — the lightbox will show "No EXIF data found"`);
            return null;
        }
        if (!tags) return null;

        const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : null);
        const exif = {
            make: tags.Make || null,
            model: tags.Model || null,
            fNumber: round(tags.FNumber),
            exposureTime: typeof tags.ExposureTime === 'number' ? tags.ExposureTime : null,
            iso: typeof tags.ISO === 'number' ? tags.ISO : null,
            focalLength: round(tags.FocalLength),
        };

        return Object.values(exif).some((value) => value !== null) ? exif : null;
    }

    static async process(filePath, fileName) {
        const baseName = path.parse(fileName).name;
        const metadata = await this.getMetadata(filePath);
        
        const results = {
            original: `${CONFIG.DIRECTORIES.IMAGES}/${fileName}`,
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.aspectRatio,
            exif: metadata.exif,
            versions: {}
        };

        for (const [sizeName, width] of Object.entries(CONFIG.IMAGE_SIZES)) {
            const targetWidth = Math.min(width, metadata.width);
            results.versions[sizeName] = await this.generateVersions(filePath, baseName, sizeName, targetWidth);
        }

        return results;
    }

    static async generateVersions(filePath, baseName, sizeName, targetWidth) {
        const jpgName = `${baseName}-${sizeName}.jpg`;
        const webpName = `${baseName}-${sizeName}.webp`;
        const jpgPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, jpgName);
        const webpPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, webpName);

        // Existing derivatives are skipped unless --force. That is deliberate and load
        // bearing: mozjpeg's output is not byte-identical between macOS and Linux, so
        // the regenerate-and-diff gate in CI only works because nothing is re-encoded
        // there. The cost is that a *replaced* source keeps its old derivatives —
        // `check:gallery --deep` compares their height to catch exactly that, and tells
        // you to rerun with --force.
        if (FORCE || !fs.existsSync(webpPath)) {
            await sharp(filePath).rotate().resize(targetWidth).webp({ quality: CONFIG.WEBP_QUALITY, effort: CONFIG.WEBP_EFFORT }).toFile(webpPath);
        }

        if (FORCE || !fs.existsSync(jpgPath)) {
            await sharp(filePath).rotate().resize(targetWidth).jpeg({ quality: CONFIG.JPEG_QUALITY, mozjpeg: true }).toFile(jpgPath);
        }

        return {
            jpg: `${CONFIG.DIRECTORIES.OPTIMIZED}/${jpgName}`,
            webp: `${CONFIG.DIRECTORIES.OPTIMIZED}/${webpName}`,
            width: targetWidth
        };
    }

    /**
     * The 21:9 band of a series cover, pre-cropped so the browser never downloads the
     * part `object-fit: cover` discards. Generated only for covers — a band of all 18
     * photos would be dead weight, since nothing but a hero ever renders one.
     *
     * The resize is materialised as raw pixels before extracting rather than trusting
     * a predicted height: sharp owns the rounding, and being one pixel out here is an
     * `extract` past the edge, not a slightly different crop.
     */
    static async generateHeroBand(filePath, baseName, sizeName, targetWidth) {
        const jpgName = `${baseName}-hero-${sizeName}.jpg`;
        const webpName = `${baseName}-hero-${sizeName}.webp`;
        const jpgPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, jpgName);
        const webpPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, webpName);

        const { data, info } = await sharp(filePath)
            .rotate().resize(targetWidth).raw().toBuffer({ resolveWithObject: true });
        const height = Math.min(Math.round(targetWidth / CONFIG.HERO_RATIO), info.height);
        const top = Math.round((info.height - height) * CONFIG.HERO_FOCUS_Y);
        const band = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
            .extract({ left: 0, top, width: info.width, height });

        // Same skip-unless-FORCE rule as every other derivative, for the same reason:
        // CI re-runs this generator and diffs, and mozjpeg is not byte-identical
        // across platforms.
        if (FORCE || !fs.existsSync(webpPath)) {
            await band().webp({ quality: CONFIG.WEBP_QUALITY, effort: CONFIG.WEBP_EFFORT }).toFile(webpPath);
        }

        if (FORCE || !fs.existsSync(jpgPath)) {
            await band().jpeg({ quality: CONFIG.JPEG_QUALITY, mozjpeg: true }).toFile(jpgPath);
        }

        return {
            jpg: `${CONFIG.DIRECTORIES.OPTIMIZED}/${jpgName}`,
            webp: `${CONFIG.DIRECTORIES.OPTIMIZED}/${webpName}`,
            width: targetWidth,
            height
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

            console.log(`📂 Processing ${files.length} images (Concurrency: ${CONFIG.CONCURRENCY}${FORCE ? ', forcing re-encode' : ''})`);

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

            // Hero bands are generated here rather than inside build(), which stays a
            // pure transform of the manifest: this is the one step that needs to know
            // which photo ended up as a cover *and* touch the disk.
            for (const series of seriesData) {
                if (!series.cover) continue;
                const baseName = path.parse(series.cover.filename).name;
                const filePath = path.join(CONFIG.DIRECTORIES.IMAGES, series.cover.filename);
                series.heroVersions = {};
                for (const [sizeName, version] of Object.entries(series.cover.versions)) {
                    // No thumb band. The hero is full-bleed and never narrower than
                    // ~280 CSS px, so a 400px band could only ever be the *soft* pick;
                    // the page offers medium and large, same as it did uncropped.
                    if (sizeName === 'thumb') continue;
                    series.heroVersions[sizeName] =
                        await ImageProcessor.generateHeroBand(filePath, baseName, sizeName, version.width);
                }
            }

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
