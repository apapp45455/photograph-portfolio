import { createElement, getVersionSrcset, rebaseGalleryItem, withAssetBase } from "./utils.js";
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
    card.setAttribute("aria-label", `${series.title} — ${series.count} photographs`);

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
      source.sizes = `(max-width: ${this.breakpoints.TABLET}px) 100vw, 55vw`;
      picture.appendChild(source);
    }

    const img = document.createElement("img");
    img.alt = series.title;
    img.width = series.cover.width;
    img.height = series.cover.height;
    if (index === 0) {
      img.fetchPriority = "high";
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

  createBody(series) {
    const body = createElement("div", { className: "series-card-body" });
    body.appendChild(createElement("p", {
      className: "series-card-eyebrow",
      textContent: `Series — ${series.period}`,
    }));
    body.appendChild(createElement("h2", {
      className: "series-card-title",
      textContent: series.title,
    }));
    body.appendChild(createElement("p", {
      className: "series-card-subtitle",
      textContent: series.titleZh,
    }));
    body.appendChild(createElement("p", {
      className: "series-card-summary",
      textContent: series.summary,
    }));
    body.appendChild(createElement("span", {
      className: "series-card-cta",
      textContent: `View series · ${series.count} photographs`,
    }));
    return body;
  }
}

/**
 * Renders the series cards on the home page. Hides its section entirely when
 * there is nothing to show, so the page never carries an empty heading.
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
      if (this.section) this.section.hidden = true;
      return;
    }

    const fragment = document.createDocumentFragment();
    this.data.forEach((series, index) => fragment.appendChild(this.renderer.render(series, index)));
    this.container.replaceChildren(fragment);
  }
}

/**
 * Series-page tile: same <picture> markup as the grid, wrapped in a <figure>
 * so each photo can carry a caption and claim a full or half row.
 */
export class ProjectItemRenderer extends GalleryItemRenderer {
  render(item, index) {
    const figure = createElement("figure", {
      className: `${this.classes.GALLERY_ITEM_WRAPPER} ${this.classes.PROJECT_ITEM} ${this.classes.PROJECT_ITEM}--${item.span}`,
    });
    figure.dataset.index = index;
    figure.appendChild(this.createPicture(item));

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
        return item ? { ...item, span: photo.span, caption: photo.caption } : null;
      })
      .filter(Boolean);
  };
}

/** Home-page grid: everything that is not part of a series. */
export function selectUngrouped(galleryData) {
  return galleryData.filter((item) => !item.series);
}
