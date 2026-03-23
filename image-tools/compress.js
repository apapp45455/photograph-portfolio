const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    OUTPUT_DIR: 'images',
    QUALITY: 80,
    MOZJPEG: true
};

/**
 * Compresses an image using Sharp with optimized settings.
 * @param {string} filePath - Path to the source image.
 * @returns {Promise<void>}
 */
async function compressImage(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  File not found: ${filePath}`);
        return;
    }

    const fileName = path.basename(filePath);
    const outputPath = path.join(CONFIG.OUTPUT_DIR, fileName);

    console.log(`⏳ Processing: ${fileName}...`);

    try {
        await sharp(filePath)
            .jpeg({ 
                quality: CONFIG.QUALITY, 
                mozjpeg: CONFIG.MOZJPEG 
            })
            .withMetadata() // Preserve EXIF and other metadata
            .toFile(outputPath);

        console.log(`✅ Success: ${outputPath}`);
    } catch (error) {
        console.error(`❌ Failed to process ${fileName}:`, error.message);
    }
}

/**
 * Main execution function.
 */
async function run() {
    const files = process.argv.slice(2);

    if (files.length === 0) {
        console.log('❌ No files specified.');
        console.log('   Usage: node compress.js <path-to-image1> <path-to-image2> ...');
        process.exit(1);
    }

    // Ensure output directory exists
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }

    // Process all files in parallel
    await Promise.all(files.map(file => compressImage(file)));
}

run();
