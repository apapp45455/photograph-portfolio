# Graph Report - .  (2026-07-13)

## Corpus Check
- Large corpus: 101 files · ~1,156,266 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 131 nodes · 189 edges · 11 communities (8 shown, 3 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.83)
- Token cost: 67,052 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `Lightbox` - 13 edges
2. `ExifMetadataReader` - 10 edges
3. `LightboxView` - 10 edges
4. `compress.js (Image Compression Tool)` - 10 edges
5. `Gallery` - 9 edges
6. `generate-gallery.js (Gallery Data Generator Tool)` - 9 edges
7. `createElement()` - 7 edges
8. `Key Files List` - 6 edges
9. `js/gallery-data.json (generated data file)` - 6 edges
10. `Lightbox DOM Structure (#lightbox)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `EXIF/GPS Metadata Preservation` --shares_data_with--> `ExifMetadataReader`  [INFERRED]
  image-tools/README.md → js/script.js
- `Prev/Next Navigation Buttons` --references--> `Lightbox`  [INFERRED]
  index.html → js/script.js
- `#gallery-container element` --references--> `Gallery`  [INFERRED]
  index.html → js/script.js
- `exif-js CDN Script Tag` --shares_data_with--> `ExifMetadataReader`  [INFERRED]
  index.html → js/script.js
- `#lightbox-img element` --references--> `ExifMetadataReader`  [INFERRED]
  index.html → js/script.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Frontend Class Structure of js/script.js** — js_script_gallerydatasource, js_script_galleryitemrenderer, js_script_gallery, js_script_lightboxview, js_script_lightbox, js_script_exifmetadatareader, js_script_metadatarenderer, js_script_app [EXTRACTED 1.00]
- **Raw Photo to Gallery Data Pipeline** — claude_raw_images_dir, image_tools_compress_module, claude_images_dir, image_tools_generate_gallery_module, claude_images_optimized_dir, js_gallery_data_datafile [EXTRACTED 1.00]
- **Lightbox Feature (DOM + Frontend Classes)** — index_lightbox_dom, index_lightbox_img, index_lightbox_metadata, index_prev_next_nav, js_script_lightbox, js_script_lightboxview, js_script_metadatarenderer, js_script_exifmetadatareader [INFERRED 0.85]

## Communities (11 total, 3 thin omitted)

### Community 0 - "npm Package Config"
Cohesion: 0.09
Nodes (21): author, bugs, url, dependencies, sharp, description, homepage, keywords (+13 more)

### Community 1 - "Image Pipeline & Gallery Data"
Cohesion: 0.14
Nodes (17): Runtime Data Flow Pipeline, Image Size Tiers (thumb/medium/large), images/ Directory, images/optimized/ Directory, raw-images/ Directory, EXIF/GPS Metadata Preservation, compress.js (Image Compression Tool), MozJPEG Compression Algorithm (+9 more)

### Community 2 - "Gallery Item Rendering"
Cohesion: 0.23
Nodes (8): #lightbox-metadata element, CONFIG, createElement(), GalleryItemRenderer, getLargestVersionUrl(), getSortedVersions(), getVersionSrcset(), MetadataRenderer

### Community 3 - "Site Structure & Landing Page"
Cohesion: 0.21
Nodes (12): Cloudflare Web Analytics, Key Files List, No-Build-Step, No-Framework Architecture, About Section, Cloudflare Web Analytics Beacon Script, David Wang (site owner/photographer), Footer Contact Info, Gear Section (+4 more)

### Community 4 - "Gallery Grid & App Bootstrap"
Cohesion: 0.24
Nodes (4): Custom gallery:open Event Delegation, #gallery-container element, App, Gallery

### Community 6 - "EXIF Metadata & Lightbox DOM"
Cohesion: 0.24
Nodes (6): exif-js CDN Script Tag, #lightbox-caption element, Lightbox DOM Structure (#lightbox), #lightbox-img element, Prev/Next Navigation Buttons, ExifMetadataReader

### Community 7 - "generate-gallery.js Tool"
Cohesion: 0.31
Nodes (5): fs, GalleryGenerator, ImageProcessor, path, sharp

### Community 9 - "compress.js Tool"
Cohesion: 0.38
Nodes (6): compressImage(), CONFIG, fs, path, run(), sharp

## Knowledge Gaps
- **35 isolated node(s):** `fs`, `path`, `CONFIG`, `fs`, `path` (+30 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `js/gallery-data.json (generated data file)` connect `Image Pipeline & Gallery Data` to `Site Structure & Landing Page`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `generate-gallery.js (Gallery Data Generator Tool)` connect `Image Pipeline & Gallery Data` to `Site Structure & Landing Page`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Lightbox` connect `Lightbox State Machine` to `Image Pipeline & Gallery Data`, `Gallery Item Rendering`, `EXIF Metadata & Lightbox DOM`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `ExifMetadataReader` (e.g. with `EXIF/GPS Metadata Preservation` and `exif-js CDN Script Tag`) actually correct?**
  _`ExifMetadataReader` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `CONFIG` to the rest of the system?**
  _35 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `npm Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Image Pipeline & Gallery Data` be split into smaller, more focused modules?**
  _Cohesion score 0.14035087719298245 - nodes in this community are weakly interconnected._