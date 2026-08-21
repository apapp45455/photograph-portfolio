export const CONFIG = {
  SELECTORS: {
    GALLERY: "#gallery-container",
    SERIES_LIST: "#series-list",
    SERIES_SECTION: "#series",
    LIGHTBOX: "#lightbox",
    LIGHTBOX_IMG: "#lightbox-img",
    LIGHTBOX_CAPTION: "#lightbox-caption",
    LIGHTBOX_METADATA: "#lightbox-metadata",
    CLOSE_BTN: ".close-btn",
    PREV_BTN: "#prev-btn",
    NEXT_BTN: "#next-btn",
    LIGHTBOX_INFO: ".lightbox-info",
  },
  PATHS: {
    GALLERY_DATA: "js/gallery-data.json",
    SERIES_DATA: "js/series-data.json",
  },
  CLASSES: {
    ACTIVE: "active",
    FADE_IN: "fade-in",
    ERROR: "error-msg",
    GALLERY_ITEM_WRAPPER: "gallery-item-wrapper",
    GALLERY_ITEM: "gallery-item",
    LOADED: "loaded",
    SERIES_CARD: "series-card",
    PROJECT_ITEM: "project-item",
  },
  // Tier names come from IMAGE_SIZES in image-tools/generate-gallery.js. A grid tile
  // is at most 33vw on desktop and 100vw on a phone, so `large` is never the right
  // pick — but a 3x phone computes 390 * 3 = 1170 and would take it anyway. Named here
  // rather than inline in main.js so scripts/check-gallery.js can assert they still
  // match the manifest: getVersionSrcset filters by name, so a rename would silently
  // yield an empty srcset and drop every tile to the 400px thumb.
  GRID_TIERS: ["thumb", "medium"],
  BREAKPOINTS: {
    MOBILE: 600,
    TABLET: 1024,
  },
  EVENTS: {
    OPEN_LIGHTBOX: "gallery:open",
  },
};
