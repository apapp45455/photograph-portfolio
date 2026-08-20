import { CONFIG } from "./config.js";
import { GalleryDataSource, Gallery } from "./gallery.js";
import { SeriesDataSource, ProjectItemRenderer, selectSeriesPhotos } from "./series.js";
import { withAssetBase } from "./utils.js";
import { mountLightbox } from "./page.js";

/**
 * Series page (projects/*.html). Which series to render and how far the page
 * sits from the site root are declared on <body>:
 *
 *   <body data-series="japan" data-asset-base="../">
 *
 * so a new series page needs no new JavaScript — only its own hero copy.
 */
class ProjectApp {
  static async start() {
    const { series: seriesId, assetBase = "" } = document.body.dataset;
    const container = document.querySelector(CONFIG.SELECTORS.GALLERY);
    if (!container || !seriesId) return;

    const series = await ProjectApp.findSeries(seriesId, assetBase);
    if (!series) {
      console.error(`Unknown series: ${seriesId}`);
      container.textContent = "This series is not available.";
      container.classList.add(CONFIG.CLASSES.ERROR);
      return;
    }

    ProjectApp.fillSeriesFields(series);

    const gallery = new Gallery({
      container,
      dataSource: new GalleryDataSource(withAssetBase(assetBase, CONFIG.PATHS.GALLERY_DATA), assetBase),
      itemRenderer: new ProjectItemRenderer({
        breakpoints: CONFIG.BREAKPOINTS,
        classes: CONFIG.CLASSES,
        sizes: ProjectApp.sizesFor,
      }),
      classes: CONFIG.CLASSES,
      openEventName: CONFIG.EVENTS.OPEN_LIGHTBOX,
      select: selectSeriesPhotos(series),
    });

    await gallery.init();
    mountLightbox(gallery.data);
  }

  /**
   * The hero copy is hand-written per series, but anything the manifest already
   * knows is filled in from it — a sixth photo would otherwise leave "Frames 5"
   * on the page with lint, check-gallery and e2e all still green.
   */
  static fillSeriesFields(series) {
    const values = {
      period: `Series — ${series.period}`,
      count: String(series.count),
    };

    for (const [field, value] of Object.entries(values)) {
      document.querySelectorAll(`[data-series-field="${field}"]`).forEach((el) => {
        el.textContent = value;
      });
    }
  }

  static async findSeries(seriesId, assetBase) {
    try {
      const all = await new SeriesDataSource(
        withAssetBase(assetBase, CONFIG.PATHS.SERIES_DATA),
        assetBase
      ).load();
      return all.find((series) => series.id === seriesId) || null;
    } catch (error) {
      console.error("Error loading series data:", error);
      return null;
    }
  }

  /** Full-span photos fill the editorial column; half-span ones share it. */
  static sizesFor(item) {
    const { MOBILE, TABLET } = CONFIG.BREAKPOINTS;
    return item.span === "full"
      ? `(max-width: ${TABLET}px) 100vw, 1100px`
      : `(max-width: ${MOBILE}px) 100vw, (max-width: ${TABLET}px) 50vw, 550px`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ProjectApp.start();
});
