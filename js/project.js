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

    // Kick the gallery manifest off before awaiting the series one: Gallery does not
    // touch its dataSource until init(), so the two requests overlap instead of
    // chaining module eval → series → gallery → first image.
    const galleryData = new GalleryDataSource(
      withAssetBase(assetBase, CONFIG.PATHS.GALLERY_DATA),
      assetBase
    ).load();
    galleryData.catch(() => {}); // handled by Gallery.init below

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
      dataSource: { load: () => galleryData },
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

  /**
   * Full-span photos fill the editorial column; half-span ones share it.
   *
   * The numbers are the real boxes, not round ones: .project-main is 1100px wide
   * with 20px of padding, so the column is 1060px and each half is (1060 - 40)/2.
   * Overstating by 40px puts the request on the far side of the 1080w candidate and
   * pulls -large where -medium serves.
   */
  static sizesFor(item) {
    const { MOBILE } = CONFIG.BREAKPOINTS;
    return item.span === "full"
      ? "(max-width: 1100px) calc(100vw - 40px), 1060px"
      : `(max-width: ${MOBILE}px) calc(100vw - 40px), (max-width: 1100px) calc(50vw - 40px), 510px`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ProjectApp.start();
});
