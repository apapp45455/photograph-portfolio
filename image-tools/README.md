# 圖片壓縮工具 (Image Compressor)

這個工具使用 `sharp` 函式庫，旨在壓縮 JPEG 圖片的同時，完整保留原始的 Metadata（如 EXIF、GPS、拍攝資訊等）。

## 功能特點
- **保留 Metadata**：確保攝影資訊（相機型號、光圈、快門、GPS 等）不遺失。
- **高品質壓縮**：預設使用 MozJPEG 演算法，在維持視覺品質的前提下最大化減小檔案體積。
- **手動選擇**：您可以精確指定要處理的檔案，不會誤動到其他圖片。

## 安裝需求
在使用此工具前，請確保您的環境已安裝 Node.js，並在專案根目錄執行：
```bash
npm install
```
*(已包含 `sharp` 套件)*

## 使用方法

請在專案根目錄執行以下指令：

### 1. 壓縮單張圖片
```bash
node image-tools/compress.js images/your_photo.jpg
```

### 2. 壓縮多張圖片
```bash
node image-tools/compress.js images/photo1.jpg images/photo2.jpg
```

### 3. 壓縮整個資料夾的 JPG 檔案
```bash
node image-tools/compress.js images/*.jpg
```

## 輸出路徑
處理後的圖片將存放於根目錄的 `images_optimized/` 資料夾中，檔名與原圖相同。

## 自定義設定
您可以編輯 `image-tools/compress.js` 檔案中的常數來變更設定：
- `QUALITY`: 壓縮品質 (預設 80)
- `OUTPUT_DIR`: 輸出資料夾名稱
