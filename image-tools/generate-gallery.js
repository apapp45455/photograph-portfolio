const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGES_DIR = 'images';
const OUTPUT_FILE = 'js/gallery-data.json';

async function generateGalleryData() {
    try {
        const files = fs.readdirSync(IMAGES_DIR).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });

        const galleryData = [];

        console.log(`Found ${files.length} images. Processing metadata...`);

        for (const file of files) {
            const filePath = path.join(IMAGES_DIR, file);
            
            try {
                const metadata = await sharp(filePath).metadata();
                
                galleryData.push({
                    filename: file,
                    width: metadata.width,
                    height: metadata.height,
                    // Calculate aspect ratio for layout placeholders if needed
                    aspectRatio: metadata.width / metadata.height
                });
                
                process.stdout.write('.'); // Progress indicator
            } catch (err) {
                console.error(`\nError processing ${file}:`, err.message);
            }
        }

        console.log('\nWriting data to JSON...');
        
        // Sort by filename or date if possible? Default filename sort for now.
        // galleryData.sort((a, b) => a.filename.localeCompare(b.filename));

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(galleryData, null, 2));
        console.log(`✅ Gallery data generated at ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('❌ Error generating gallery data:', error);
    }
}

generateGalleryData();
