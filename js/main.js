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
    // Both manifests are fetched at once. Awaiting the series cards first delayed the
    // gallery request until they had rendered, for no benefit — they fill separate
    // containers, so neither ordering affects layout.
    const seriesRendered = App.renderSeries();

    const gallery = new Gallery({
      container: document.querySelector(CONFIG.SELECTORS.GALLERY),
      dataSource: new GalleryDataSource(CONFIG.PATHS.GALLERY_DATA),
      itemRenderer: new GalleryItemRenderer({
        breakpoints: CONFIG.BREAKPOINTS,
        classes: CONFIG.CLASSES,
        // See CONFIG.GRID_TIERS: `large` is the lightbox's tier, not the grid's.
        tiers: CONFIG.GRID_TIERS,
      }),
      classes: CONFIG.CLASSES,
      openEventName: CONFIG.EVENTS.OPEN_LIGHTBOX,
      // Note: a photo tagged with a series is dropped from this grid on the strength of
      // gallery-data.json alone, so if series-data.json fails to load it is reachable
      // from nowhere. Both manifests are served from the same origin and check-gallery
      // keeps them in step, so they realistically fail together — accepted, not missed.
      select: selectUngrouped,
    });

    // The lightbox is mounted as soon as the grid exists: the tiles are visible and
    // focusable at that point, so gating the mount on series-data.json would leave
    // them silently inert if that request were slow.
    await gallery.init();
    mountLightbox(gallery.data);
    await seriesRendered;
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
