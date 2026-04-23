# 圖片工具 (Image Tools)

這個資料夾包含兩個工具，使用 `sharp` 函式庫處理圖片：

- **`compress.js`**：壓縮單張或多張圖片，保留完整 EXIF Metadata
- **`generate-gallery.js`**：批次產生多尺寸優化版本，並輸出 Gallery 所需的 JSON 資料

## 安裝需求
在使用此工具前，請確保您的環境已安裝 Node.js，並在專案根目錄執行：
```bash
npm install
```
*(已包含 `sharp` 套件)*

---

## 工具一：圖片壓縮 (`compress.js`)

壓縮 JPEG 圖片的同時，完整保留原始的 Metadata（如 EXIF、GPS、拍攝資訊等）。

### 功能特點
- **保留 Metadata**：確保攝影資訊（相機型號、光圈、快門、GPS 等）不遺失。
- **高品質壓縮**：預設使用 MozJPEG 演算法，在維持視覺品質的前提下最大化減小檔案體積。
- **手動選擇**：您可以精確指定要處理的檔案，不會誤動到其他圖片。

### 使用方法

請在**專案根目錄**執行以下指令：

#### 壓縮單張圖片
```bash
node image-tools/compress.js raw-images/your_photo.jpg
```

#### 壓縮多張圖片
```bash
node image-tools/compress.js raw-images/photo1.jpg raw-images/photo2.jpg
```

#### 壓縮整個資料夾的 JPG 檔案
```bash
node image-tools/compress.js raw-images/*.jpg
```

### 輸出路徑
處理後的圖片將存放於根目錄的 `images/` 資料夾中，檔名與原圖相同。

### 自定義設定
您可以編輯 `image-tools/compress.js` 檔案中的常數來變更設定：
- `QUALITY`: 壓縮品質 (預設 80)
- `OUTPUT_DIR`: 輸出資料夾名稱

---

## 工具二：Gallery 資料產生器 (`generate-gallery.js`)

批次讀取 `images/` 資料夾中的所有圖片，為每張圖片產生三種尺寸的優化版本（`.jpg` + `.webp`），並輸出一份 JSON 檔案供前端 Gallery 使用。

### 功能特點
- **多尺寸輸出**：自動產生 thumb（400px）、medium（1080px）、large（1920px）三種版本。
- **雙格式支援**：每個尺寸同時輸出 `.jpg` 與 `.webp`，讓瀏覽器選用最佳格式。
- **增量處理**：已存在的優化圖片不會重新產生，可安全重複執行。
- **並行處理**：預設同時處理 4 張圖片，加快建置速度。

### 使用方法

請在**專案根目錄**執行：

```bash
node image-tools/generate-gallery.js
```

執行後會看到類似輸出：
```
🚀 Starting gallery build process...
📂 Processing 12 images (Concurrency: 4)
............
✨ Done in 15.32s! Data saved to js/gallery-data.json
```

### 輸出結果

| 產出物 | 路徑 | 說明 |
|---|---|---|
| 優化圖片 | `images/optimized/` | 各尺寸的 `.jpg` 與 `.webp` |
| Gallery 資料 | `js/gallery-data.json` | 圖片路徑與 metadata 的 JSON |

`gallery-data.json` 的格式如下：
```json
[
  {
    "filename": "信義_101.jpg",
    "original": "images/信義_101.jpg",
    "width": 4000,
    "height": 3000,
    "aspectRatio": 1.333,
    "versions": {
      "thumb":  { "jpg": "images/optimized/信義_101-thumb.jpg",  "webp": "images/optimized/信義_101-thumb.webp",  "width": 400  },
      "medium": { "jpg": "images/optimized/信義_101-medium.jpg", "webp": "images/optimized/信義_101-medium.webp", "width": 1080 },
      "large":  { "jpg": "images/optimized/信義_101-large.jpg",  "webp": "images/optimized/信義_101-large.webp",  "width": 1920 }
    }
  }
]
```

### 自定義設定
您可以編輯 `image-tools/generate-gallery.js` 檔案中的 `CONFIG` 來變更設定：
- `DIRECTORIES.IMAGES`: 來源圖片資料夾 (預設 `images`)
- `DIRECTORIES.OPTIMIZED`: 優化圖片輸出資料夾 (預設 `images/optimized`)
- `DIRECTORIES.DATA_OUTPUT`: JSON 輸出路徑 (預設 `js/gallery-data.json`)
- `IMAGE_SIZES`: 各尺寸的最大寬度
- `QUALITY`: 壓縮品質 (預設 80)
- `CONCURRENCY`: 並行處理數量 (預設 4)
