const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = 'images';
const OPTIMIZED_DIR = 'images/optimized'; // Output directory for processed images
const OUTPUT_FILE = 'js/gallery-data.json';

// Configuration for image sizes
const SIZES = {
    thumb: 400,   // For masonry grid / mobile
    medium: 1080, // For tablets / small laptops
    large: 1920   // For desktop lightbox
};

async function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function processImage(filePath, fileName) {
    const baseName = path.parse(fileName).name;
    const results = {
        original: `${IMAGES_DIR}/${fileName}`,
        versions: {}
    };

    // Keep track of metadata from the original image
    const metadata = await sharp(filePath).metadata();
    results.width = metadata.width;
    results.height = metadata.height;
    results.aspectRatio = metadata.width / metadata.height;

    // Process each size
    for (const [sizeName, width] of Object.entries(SIZES)) {
        // Skip if original is smaller than target width (unless it's thumb, strictly speaking we might just copy, but resizing up is bad)
        const targetWidth = Math.min(width, metadata.width);
        
        // Define filenames
        const jpgName = `${baseName}-${sizeName}.jpg`;
        const webpName = `${baseName}-${sizeName}.webp`;
        
        const jpgPath = path.join(OPTIMIZED_DIR, jpgName);
        const webpPath = path.join(OPTIMIZED_DIR, webpName);

        results.versions[sizeName] = {
            jpg: `${OPTIMIZED_DIR}/${jpgName}`,
            webp: `${OPTIMIZED_DIR}/${webpName}`,
            width: targetWidth
        };

        // 1. Generate WebP
        if (!fs.existsSync(webpPath)) {
            await sharp(filePath)
                .resize(targetWidth)
                .webp({ quality: 80 })
                .toFile(webpPath);
        }

        // 2. Generate optimized JPG
        if (!fs.existsSync(jpgPath)) {
            await sharp(filePath)
                .resize(targetWidth)
                .jpeg({ quality: 80, mozjpeg: true })
                .toFile(jpgPath);
        }
    }

    process.stdout.write('.');
    return results;
}

async function generateGallery() {
    console.log('🚀 Starting gallery build process...');
    
    await ensureDir(OPTIMIZED_DIR);

    const files = fs.readdirSync(IMAGES_DIR).filter(file => {
        const ext = path.extname(file).toLowerCase();
        // Ignore the optimized folder itself and non-image files
        return ['.jpg', '.jpeg', '.png'].includes(ext);
    });

    console.log(`📂 Found ${files.length} images in ${IMAGES_DIR}`);
    
    const galleryData = [];

    for (const file of files) {
        try {
            const imageData = await processImage(path.join(IMAGES_DIR, file), file);
            galleryData.push({
                filename: file, // Keep original filename for reference if needed
                ...imageData
            });
        } catch (err) {
            console.error(`\n❌ Error processing ${file}:`, err.message);
        }
    }

    console.log('\n💾 Writing data to JSON...');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(galleryData, null, 2));
    console.log(`✨ Done! Gallery data saved to ${OUTPUT_FILE}`);
}

generateGallery();