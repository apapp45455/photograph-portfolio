import { CONFIG } from "./config.js";
import { ExifMetadataReader, MetadataRenderer } from "./exif.js";
import { LightboxView, Lightbox } from "./lightbox.js";

/**
 * The lightbox DOM is identical on every page (index.html and each series page),
 * so both entry points mount it the same way.
 */
export function mountLightbox(galleryData) {
  if (galleryData.length === 0) return null;

  return new Lightbox({
    galleryData,
    view: new LightboxView(getLightboxElements(), CONFIG.CLASSES),
    metadataReader: new ExifMetadataReader(),
    metadataRenderer: new MetadataRenderer(),
    openEventName: CONFIG.EVENTS.OPEN_LIGHTBOX,
  });
}

export function getLightboxElements() {
  return {
    container: document.querySelector(CONFIG.SELECTORS.LIGHTBOX),
    img: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_IMG),
    webpSource: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_WEBP),
    info: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_INFO),
    caption: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_CAPTION),
    metadata: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_METADATA),
    closeBtn: document.querySelector(CONFIG.SELECTORS.CLOSE_BTN),
    prevBtn: document.querySelector(CONFIG.SELECTORS.PREV_BTN),
    nextBtn: document.querySelector(CONFIG.SELECTORS.NEXT_BTN),
  };
}
