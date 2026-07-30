# Graph Report - photograph_web  (2026-07-13)

## Corpus Check
- 16 files · ~1,156,569 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 163 nodes · 188 edges · 34 communities (8 shown, 26 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1f455c01`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- npm Package Config
- Image Pipeline & Gallery Data
- Gallery Item Rendering
- Site Structure & Landing Page
- Gallery Grid & App Bootstrap
- Lightbox State Machine
- EXIF Metadata & Lightbox DOM
- generate-gallery.js Tool
- LightboxView DOM Manipulation
- compress.js Tool
- Portfolio Site Overview
- Gallery
- LightboxView
- CLAUDE.md
- ExifMetadataReader
- Verify photograph_web
- Cloudflare Web Analytics
- Image Size Tiers (thumb/medium/large)
- images/ Directory
- images/optimized/ Directory
- Key Files List
- No-Build-Step, No-Framework Architecture
- Static Photography Portfolio Site
- raw-images/ Directory
- EXIF/GPS Metadata Preservation
- compress.js (Image Compression Tool)
- MozJPEG Compression Algorithm
- OUTPUT_DIR constant
- QUALITY constant (default 80)
- Concurrent Processing (4 images in parallel)
- Incremental Processing (skip existing optimized files)
- generate-gallery.js (Gallery Data Generator Tool)
- sharp image-processing library
- js/gallery-data.json (generated data file)

## God Nodes (most connected - your core abstractions)
1. `Lightbox` - 11 edges
2. `LightboxView` - 10 edges
3. `ExifMetadataReader` - 7 edges
4. `Gallery` - 7 edges
5. `createElement()` - 7 edges
6. `GalleryItemRenderer` - 6 edges
7. `formatPhotoTitle()` - 5 edges
8. `工具一：圖片壓縮 (`compress.js`)` - 5 edges
9. `工具二：Gallery 資料產生器 (`generate-gallery.js`)` - 5 edges
10. `Lightbox DOM Structure (#lightbox)` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Raw Photo to Gallery Data Pipeline** — claude_raw_images_dir, image_tools_compress_module, claude_images_dir, image_tools_generate_gallery_module, claude_images_optimized_dir, js_gallery_data_datafile [EXTRACTED 1.00]

## Communities (34 total, 26 thin omitted)

### Community 0 - "npm Package Config"
Cohesion: 0.09
Nodes (21): author, bugs, url, dependencies, sharp, description, homepage, keywords (+13 more)

### Community 2 - "Gallery Item Rendering"
Cohesion: 0.17
Nodes (9): CONFIG, MetadataRenderer, GalleryDataSource, GalleryItemRenderer, createElement(), formatPhotoTitle(), getLargestVersionUrl(), getSortedVersions() (+1 more)

### Community 3 - "Site Structure & Landing Page"
Cohesion: 0.12
Nodes (16): About Section, Cloudflare Web Analytics Beacon Script, David Wang (site owner/photographer), exif-js CDN Script Tag, Footer Contact Info, #gallery-container element, Gear Section, Hero Section (+8 more)

### Community 6 - "EXIF Metadata & Lightbox DOM"
Cohesion: 0.12
Nodes (15): 使用方法, 使用方法, 功能特點, 功能特點, 圖片工具 (Image Tools), 壓縮單張圖片, 壓縮多張圖片, 壓縮整個資料夾的 JPG 檔案 (+7 more)

### Community 7 - "generate-gallery.js Tool"
Cohesion: 0.27
Nodes (6): CONFIG, fs, GalleryGenerator, ImageProcessor, path, sharp

### Community 9 - "compress.js Tool"
Cohesion: 0.38
Nodes (6): compressImage(), CONFIG, fs, path, run(), sharp

### Community 13 - "CLAUDE.md"
Cohesion: 0.33
Nodes (4): Adding a new photo (end-to-end flow), Architecture, Commands, What this is

### Community 15 - "Verify photograph_web"
Cohesion: 0.40
Nodes (4): Drive (Playwright), Known noise (not failures), Serve, Verify photograph_web

## Knowledge Gaps
- **70 isolated node(s):** `fs`, `path`, `CONFIG`, `fs`, `path` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Lightbox` connect `LightboxView DOM Manipulation` to `Gallery Item Rendering`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `LightboxView` connect `LightboxView` to `Gallery Item Rendering`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `ExifMetadataReader` connect `ExifMetadataReader` to `Gallery Item Rendering`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `CONFIG` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `npm Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Site Structure & Landing Page` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `EXIF Metadata & Lightbox DOM` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._