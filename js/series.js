import { createElement, getVersionSrcset, rebaseGalleryItem, seriesCoverSizes, withAssetBase } from "./utils.js";
import { GalleryItemRenderer } from "./gallery.js";

/** macOS hands back NFD for CJK filenames; compare normalised so joins never silently miss. */
const key = (filename) => String(filename).normalize("NFC");

export class SeriesDataSource {
  constructor(dataUrl, assetBase = "") {
    this.dataUrl = dataUrl;
    this.assetBase = assetBase;
  }

  /**
   * @returns {Promise<import("./utils.js").Series[]>} — empty when the site has no series yet.
   */
  async load() {
    const response = await fetch(this.dataUrl);
    if (!response.ok) throw new Error("Failed to load series data");
    const data = await response.json();

    return data.map((series) => ({
      ...series,
      page: withAssetBase(this.assetBase, series.page),
      cover: series.cover ? rebaseGalleryItem(series.cover, this.assetBase) : null,
    }));
  }
}

/**
 * The home-page entry card for one series: a wide cover crop with the title
 * and summary set beside it.
 */
export class SeriesCardRenderer {
  constructor({ breakpoints, classes }) {
    this.breakpoints = breakpoints;
    this.classes = classes;
  }

  /**
   * @param {number} index - position on the page; the first cover is the LCP
   *   element, so it loads eagerly instead of lazily.
   */
  render(series, index = 0) {
    const card = createElement("a", { className: this.classes.SERIES_CARD });
    card.href = series.page;
    // Not aria-label (it would hide the card's copy from AT) and not the bare subtree
    // (that names the link with the whole ~90-character summary, which also fills the
    // links rotor). Point at the title and the CTA: short name, copy still readable.
    card.setAttribute("aria-labelledby", `${SeriesCardRenderer.titleId(series)} ${SeriesCardRenderer.ctaId(series)}`);

    card.appendChild(this.createCover(series, index));
    card.appendChild(this.createBody(series));
    return card;
  }

  createCover(series, index) {
    const figure = createElement("div", { className: "series-card-cover" });
    if (!series.cover) return figure;

    const picture = document.createElement("picture");
    for (const [type, format] of [["image/webp", "webp"], ["image/jpeg", "jpg"]]) {
      const source = document.createElement("source");
      source.type = type;
      source.srcset = getVersionSrcset(series.cover.versions, format);
      // Real boxes, not round ones: stacked below TABLET (the same switch style.css
      // uses), then 1.15fr of a content column that stops at 1400 - 40 = 1360px.
      // Lives in utils.js because index.html preloads this image with the same string.
      source.sizes = seriesCoverSizes(this.breakpoints);
      picture.appendChild(source);
    }

    const img = document.createElement("img");
    img.alt = ""; // decorative: the card's text says everything this repeats
    img.width = series.cover.width;
    img.height = series.cover.height;
    if (index === 0) {
      img.setAttribute("fetchpriority", "high");
    } else {
      img.loading = "lazy";
    }

    // Append first, assign src last: on a detached <img> the <source> elements take no
    // part in selection, so the browser would fetch the JPEG and then re-select WebP.
    // fetchPriority likewise only counts if it is set before the request starts.
    picture.appendChild(img);
    img.src = series.cover.versions.medium.jpg;

    figure.appendChild(picture);
    return figure;
  }

  static titleId(series) {
    return `series-${series.id}-title`;
  }

  static ctaId(series) {
    return `series-${series.id}-cta`;
  }

  createBody(series) {
    const body = createElement("div", { className: "series-card-body" });
    body.appendChild(createElement("p", {
      className: "series-card-eyebrow",
      textContent: `Series — ${series.period}`,
    }));

    const title = createElement("h3", {
      className: "series-card-title",
      textContent: series.title,
    });
    title.id = SeriesCardRenderer.titleId(series);
    body.appendChild(title);
    body.appendChild(createElement("p", {
      className: "series-card-subtitle",
      textContent: series.titleZh,
    }));
    body.appendChild(createElement("p", {
      className: "series-card-summary",
      textContent: series.summary,
    }));
    const cta = createElement("span", {
      className: "series-card-cta",
      textContent: `View series · ${series.count} photographs`,
    });
    cta.id = SeriesCardRenderer.ctaId(series);
    body.appendChild(cta);

    return body;
  }
}

/**
 * Renders the series cards on the home page. Hides its section entirely when
 * there is nothing to show, so the page never carries an empty heading — but
 * only when the container is genuinely empty: index.html hand-writes the first
 * card (it holds the LCP cover), so a failed manifest fetch must leave that
 * card standing rather than blank the band it already renders correctly.
 */
export class SeriesShowcase {
  constructor({ container, section, dataSource, renderer }) {
    this.container = container;
    this.section = section;
    this.dataSource = dataSource;
    this.renderer = renderer;
    this.data = [];
  }

  async init() {
    try {
      this.data = await this.dataSource.load();
    } catch (error) {
      console.error("Error loading series:", error);
      this.data = [];
    }

    if (this.data.length === 0) {
      this.hideIfEmpty();
      return;
    }

    try {
      const fragment = document.createDocumentFragment();
      this.data.forEach((series, index) => fragment.appendChild(this.renderer.render(series, index)));
      this.container.replaceChildren(fragment);
    } catch (error) {
      // Malformed data (a cover with no versions, say) must degrade to a page without
      // the band, not reject out of the DOMContentLoaded handler as an unhandled
      // rejection — which is what the load-failure catch above already intends.
      console.error("Error rendering series:", error);
      this.hideIfEmpty();
    }
  }

  /** Only an empty band is worth hiding; server-rendered cards are still real content. */
  hideIfEmpty() {
    if (this.section && this.container.children.length === 0) this.section.hidden = true;
  }
}

/**
 * Series-page tile: same <picture> markup as the grid, wrapped in a <figure>
 * so each photo can carry a caption and claim a full or half row.
 */
export class ProjectItemRenderer extends GalleryItemRenderer {
  /**
   * Hand-written alt beats a de-underscored filename. Deliberately not the caption:
   * two frames can share one, which would give two controls the same accessible name.
   */
  createImage(item) {
    const img = super.createImage(item);
    if (item.alt) img.alt = item.alt;
    return img;
  }

  render(item, index) {
    const figure = createElement("figure", {
      className: `${this.classes.GALLERY_ITEM_WRAPPER} ${this.classes.PROJECT_ITEM} ${this.classes.PROJECT_ITEM}--${item.span}`,
    });
    const picture = this.createPicture(item);
    this.markOpenable(figure, picture.querySelector("img"), index);
    figure.appendChild(picture);

    if (item.caption) {
      figure.appendChild(createElement("figcaption", {
        className: "project-caption",
        textContent: item.caption,
      }));
    }

    return figure;
  }
}

/**
 * Builds the `select` function for a series page: keeps only that series' photos,
 * in the order series.json lays them out, carrying span and caption onto each item.
 */
export function selectSeriesPhotos(series) {
  return (galleryData) => {
    const byFilename = new Map(galleryData.map((item) => [key(item.filename), item]));

    return series.photos
      .map((photo) => {
        const item = byFilename.get(key(photo.filename));
        return item ? { ...item, span: photo.span, caption: photo.caption, alt: photo.alt } : null;
      })
      .filter(Boolean);
  };
}

/** Home-page grid: everything that is not part of a series. */
export function selectUngrouped(galleryData) {
  return galleryData.filter((item) => !item.series);
}
