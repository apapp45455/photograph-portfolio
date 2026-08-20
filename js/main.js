import { CONFIG } from "./config.js";
import { GalleryDataSource, GalleryItemRenderer, Gallery } from "./gallery.js";
import { SeriesDataSource, SeriesCardRenderer, SeriesShowcase, selectUngrouped } from "./series.js";
import { mountLightbox } from "./page.js";

/**
 * Home page: the series cards on top, then everything that is *not* part of a
 * series in the masonry grid below — a photo lives in one place or the other,
 * never both.
 */
class App {
  static async start() {
    await App.renderSeries();

    const gallery = new Gallery({
      container: document.querySelector(CONFIG.SELECTORS.GALLERY),
      dataSource: new GalleryDataSource(CONFIG.PATHS.GALLERY_DATA),
      itemRenderer: new GalleryItemRenderer({
        breakpoints: CONFIG.BREAKPOINTS,
        classes: CONFIG.CLASSES,
      }),
      classes: CONFIG.CLASSES,
      openEventName: CONFIG.EVENTS.OPEN_LIGHTBOX,
      select: selectUngrouped,
    });

    await gallery.init();
    mountLightbox(gallery.data);
  }

  static renderSeries() {
    const container = document.querySelector(CONFIG.SELECTORS.SERIES_LIST);
    if (!container) return Promise.resolve();

    return new SeriesShowcase({
      container,
      section: document.querySelector(CONFIG.SELECTORS.SERIES_SECTION),
      dataSource: new SeriesDataSource(CONFIG.PATHS.SERIES_DATA),
      renderer: new SeriesCardRenderer({
        breakpoints: CONFIG.BREAKPOINTS,
        classes: CONFIG.CLASSES,
      }),
    }).init();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  App.start();
});
