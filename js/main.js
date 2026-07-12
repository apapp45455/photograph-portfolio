import { CONFIG } from "./config.js";
import { GalleryDataSource, GalleryItemRenderer, Gallery } from "./gallery.js";
import { ExifMetadataReader, MetadataRenderer } from "./exif.js";
import { LightboxView, Lightbox } from "./lightbox.js";

class App {
  static async start() {
    const gallery = new Gallery({
      container: document.querySelector(CONFIG.SELECTORS.GALLERY),
      dataSource: new GalleryDataSource(CONFIG.PATHS.GALLERY_DATA),
      itemRenderer: new GalleryItemRenderer({
        breakpoints: CONFIG.BREAKPOINTS,
        classes: CONFIG.CLASSES,
      }),
      classes: CONFIG.CLASSES,
      openEventName: CONFIG.EVENTS.OPEN_LIGHTBOX,
    });

    await gallery.init();
    if (gallery.data.length === 0) return;

    new Lightbox({
      galleryData: gallery.data,
      view: new LightboxView(App.getLightboxElements(), CONFIG.CLASSES),
      metadataReader: new ExifMetadataReader(),
      metadataRenderer: new MetadataRenderer(),
      openEventName: CONFIG.EVENTS.OPEN_LIGHTBOX,
    });
  }

  static getLightboxElements() {
    return {
      container: document.querySelector(CONFIG.SELECTORS.LIGHTBOX),
      img: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_IMG),
      info: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_INFO),
      caption: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_CAPTION),
      metadata: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_METADATA),
      closeBtn: document.querySelector(CONFIG.SELECTORS.CLOSE_BTN),
      prevBtn: document.querySelector(CONFIG.SELECTORS.PREV_BTN),
      nextBtn: document.querySelector(CONFIG.SELECTORS.NEXT_BTN),
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  App.start();
});
