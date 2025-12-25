const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 設定：輸出資料夾與壓縮品質
const OUTPUT_DIR = 'images';
const QUALITY = 80;

// 取得使用者輸入的檔案路徑 (排除前兩個 node 執行的參數)
const files = process.argv.slice(2);

if (files.length === 0) {
    console.log('❌ 請指定要壓縮的圖片路徑。');
    console.log('   用法範例: node compress.js images/photo1.jpg images/photo2.jpg');
    process.exit(1);
}

// 確保輸出資料夾存在
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

files.forEach(async (filePath) => {
    try {
        const fileName = path.basename(filePath);
        const outputPath = path.join(OUTPUT_DIR, fileName);

        // 檢查檔案是否存在
        if (!fs.existsSync(filePath)) {
            console.error(`⚠️  找不到檔案: ${filePath}`);
            return;
        }

        console.log(`⏳ 正在處理: ${fileName}...`);

        await sharp(filePath)
            .jpeg({ 
                quality: QUALITY, 
                mozjpeg: true  // 使用 MozJPEG 演算法，壓縮率更好
            })
            .withMetadata()    // <--- 關鍵：保留 Metadata
            .toFile(outputPath);

        console.log(`✅ 完成: ${outputPath}`);

    } catch (error) {
        console.error(`❌ 處理失敗 ${filePath}:`, error.message);
    }
});
