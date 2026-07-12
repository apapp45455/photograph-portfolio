export const CONFIG = {
  SELECTORS: {
    GALLERY: "#gallery-container",
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
  },
  CLASSES: {
    ACTIVE: "active",
    FADE_IN: "fade-in",
    ERROR: "error-msg",
    GALLERY_ITEM_WRAPPER: "gallery-item-wrapper",
    GALLERY_ITEM: "gallery-item",
    LOADED: "loaded",
  },
  BREAKPOINTS: {
    MOBILE: 600,
    TABLET: 1024,
  },
  EVENTS: {
    OPEN_LIGHTBOX: "gallery:open",
  },
};
