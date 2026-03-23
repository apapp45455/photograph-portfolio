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
        DATA_OUTPUT: 'js/gallery-data.json'
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
        
        // Extract useful EXIF tags if they exist
        // Sharp's metadata.exif is a buffer, we can use it to get basic info 
        // or just rely on the 'metadata' object for common fields.
        const exif = {};
        if (metadata.exif) {
            // In a real-world scenario, you might use 'exifr' here for better parsing.
            // For now, we'll store basic dimensions and aspect ratio.
        }

        return {
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.width / metadata.height,
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

    static async generateVersions(filePath, baseName, sizeName, targetWidth) {
        const jpgName = `${baseName}-${sizeName}.jpg`;
        const webpName = `${baseName}-${sizeName}.webp`;
        const jpgPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, jpgName);
        const webpPath = path.join(CONFIG.DIRECTORIES.OPTIMIZED, webpName);

        if (!fs.existsSync(webpPath)) {
            await sharp(filePath).rotate().resize(targetWidth).webp({ quality: CONFIG.QUALITY }).toFile(webpPath);
        }

        if (!fs.existsSync(jpgPath)) {
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

            const files = fs.readdirSync(CONFIG.DIRECTORIES.IMAGES).filter(file => 
                CONFIG.ALLOWED_EXTENSIONS.includes(path.extname(file).toLowerCase())
            );

            console.log(`📂 Processing ${files.length} images (Concurrency: ${CONFIG.CONCURRENCY})`);

            const galleryData = [];
            
            // Next Level: Process images in chunks to manage system resources
            for (let i = 0; i < files.length; i += CONFIG.CONCURRENCY) {
                const chunk = files.slice(i, i + CONFIG.CONCURRENCY);
                const results = await Promise.all(chunk.map(async (file) => {
                    const filePath = path.join(CONFIG.DIRECTORIES.IMAGES, file);
                    const data = await ImageProcessor.process(filePath, file);
                    process.stdout.write('.');
                    return { filename: file, ...data };
                }));
                galleryData.push(...results);
            }

            fs.writeFileSync(CONFIG.DIRECTORIES.DATA_OUTPUT, JSON.stringify(galleryData, null, 2));
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n✨ Done in ${duration}s! Data saved to ${CONFIG.DIRECTORIES.DATA_OUTPUT}`);

        } catch (error) {
            console.error('💥 Critical error:', error);
            process.exit(1);
        }
    }
}

GalleryGenerator.run();
