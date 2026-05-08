/**
 * @typedef {Object} ImageVersion
 * @property {string} jpg
 * @property {string} webp
 * @property {number} width
 */

/**
 * @typedef {Object} GalleryItem
 * @property {string} filename
 * @property {string} original
 * @property {number} width
 * @property {number} height
 * @property {number} aspectRatio
 * @property {Object.<string, ImageVersion>} versions
 */

const CONFIG = {
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

function formatPhotoTitle(filename) {
  return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
}

function createElement(tagName, { className, textContent } = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent !== undefined) element.textContent = textContent;
  return element;
}

function getSortedVersions(versions) {
  return Object.values(versions).sort((a, b) => a.width - b.width);
}

function getVersionSrcset(versions, format) {
  return getSortedVersions(versions)
    .filter((version) => version[format])
    .map((version) => `${version[format]} ${version.width}w`)
    .join(", ");
}

function getLargestVersionUrl(versions, format) {
  const sortedVersions = getSortedVersions(versions).filter((version) => version[format]);
  return sortedVersions.at(-1)?.[format];
}

class GalleryDataSource {
  constructor(dataUrl) {
    this.dataUrl = dataUrl;
  }

  async load() {
    const response = await fetch(this.dataUrl);
    if (!response.ok) throw new Error("Failed to load gallery data");
    return response.json();
  }
}

class GalleryItemRenderer {
  constructor({ breakpoints, classes }) {
    this.breakpoints = breakpoints;
    this.classes = classes;
  }

  render(item, index) {
    const wrapper = createElement("div", { className: this.classes.GALLERY_ITEM_WRAPPER });
    wrapper.dataset.index = index;

    const picture = document.createElement("picture");
    picture.appendChild(this.createSource("image/webp", item, "webp"));
    picture.appendChild(this.createSource("image/jpeg", item, "jpg"));
    picture.appendChild(this.createImage(item));

    wrapper.appendChild(picture);
    return wrapper;
  }

  createSource(type, item, format) {
    const source = document.createElement("source");
    source.type = type;
    source.srcset = getVersionSrcset(item.versions, format);
    source.sizes = `(max-width: ${this.breakpoints.MOBILE}px) 100vw, (max-width: ${this.breakpoints.TABLET}px) 50vw, 33vw`;
    return source;
  }

  createImage(item) {
    const img = document.createElement("img");
    img.src = item.versions.thumb.jpg;
    img.alt = formatPhotoTitle(item.filename);
    img.classList.add(this.classes.GALLERY_ITEM);
    img.loading = "lazy";
    img.width = item.width;
    img.height = item.height;
    img.onload = () => img.classList.add(this.classes.LOADED);
    return img;
  }
}

class Gallery {
  constructor({ container, dataSource, itemRenderer, classes, openEventName, eventTarget = document }) {
    this.container = container;
    this.dataSource = dataSource;
    this.itemRenderer = itemRenderer;
    this.classes = classes;
    this.openEventName = openEventName;
    this.eventTarget = eventTarget;
    this.data = [];
  }

  async init() {
    try {
      this.data = await this.dataSource.load();
      this.initEventDelegation();
      this.render();
    } catch (error) {
      console.error("Error initializing gallery:", error);
      this.renderError("Failed to load images. Please try again later.");
    }
  }

  initEventDelegation() {
    this.container.addEventListener("click", (e) => {
      const wrapper = e.target.closest(`.${this.classes.GALLERY_ITEM_WRAPPER}`);
      if (!wrapper || wrapper.dataset.index === undefined) return;

      this.eventTarget.dispatchEvent(new CustomEvent(this.openEventName, {
        detail: { index: parseInt(wrapper.dataset.index, 10) },
      }));
    });
  }

  render() {
    const fragment = document.createDocumentFragment();
    this.data.forEach((item, index) => {
      fragment.appendChild(this.itemRenderer.render(item, index));
    });
    this.container.replaceChildren(fragment);
  }

  renderError(message) {
    const error = createElement("p", {
      className: this.classes.ERROR,
      textContent: message,
    });
    this.container.replaceChildren(error);
  }
}

class ExifMetadataReader {
  constructor({
    exifApi = window.EXIF,
    imageFactory = () => new Image(),
    protocol = window.location.protocol,
  } = {}) {
    this.exifApi = exifApi;
    this.imageFactory = imageFactory;
    this.protocol = protocol;
  }

  async read(originalSrc) {
    if (this.protocol === "file:") {
      return { status: "error", message: "Metadata unavailable in local file mode." };
    }

    return new Promise((resolve) => {
      const tempImg = this.imageFactory();
      tempImg.src = originalSrc;

      tempImg.onload = function () {
        if (!this.exifApi) {
          resolve({ status: "error", message: "Metadata reader unavailable" });
          return;
        }

        const exif = this.exifApi;
        exif.getData(tempImg, function () {
          const metadata = {
            camera: [exif.getTag(this, "Make"), exif.getTag(this, "Model")].filter(Boolean).join(" "),
            aperture: ExifMetadataReader.formatAperture(exif.getTag(this, "FNumber")),
            shutter: ExifMetadataReader.formatShutterSpeed(exif.getTag(this, "ExposureTime")),
            iso: exif.getTag(this, "ISOSpeedRatings") || "--",
            focal: ExifMetadataReader.formatFocalLength(exif.getTag(this, "FocalLength")),
          };

          const hasMetadata = metadata.camera || metadata.aperture !== "--" || metadata.shutter !== "--" ||
            metadata.iso !== "--" || metadata.focal !== "--";

          resolve(hasMetadata
            ? { status: "ready", values: metadata }
            : { status: "empty", message: "No EXIF data found" });
        });
      }.bind(this);

      tempImg.onerror = () => resolve({ status: "error", message: "Failed to load metadata" });
    });
  }

  static formatAperture(fNumber) {
    return fNumber ? `f/${parseFloat(fNumber).toFixed(1)}` : "--";
  }

  static formatFocalLength(focalLength) {
    return focalLength ? `${parseFloat(focalLength).toFixed(0)}mm` : "--";
  }

  static formatShutterSpeed(exposureTime) {
    if (!exposureTime) return "--";
    if (exposureTime >= 1) return `${exposureTime}s`;
    return `1/${Math.round(1 / exposureTime)}s`;
  }
}

class MetadataRenderer {
  renderLoading(container) {
    container.replaceChildren(createElement("div", {
      className: "metadata-loading",
      textContent: "Loading metadata...",
    }));
  }

  render(container, metadata) {
    if (metadata.status !== "ready") {
      container.replaceChildren(createElement("div", {
        className: metadata.status === "empty" ? "metadata-empty" : "metadata-error",
        textContent: metadata.message,
      }));
      return;
    }

    const grid = createElement("div", { className: "metadata-grid" });
    [
      ["Camera", metadata.values.camera || "--"],
      ["Aperture", metadata.values.aperture],
      ["Shutter", metadata.values.shutter],
      ["ISO", metadata.values.iso],
      ["Focal", metadata.values.focal],
    ].forEach(([label, value]) => {
      const item = createElement("div", { className: "metadata-item" });
      item.appendChild(createElement("span", { className: "label", textContent: label }));
      item.appendChild(createElement("span", { className: "value", textContent: value }));
      grid.appendChild(item);
    });

    container.replaceChildren(grid);
  }
}

class LightboxView {
  constructor(elements, classes, pageBody = document.body) {
    this.elements = elements;
    this.classes = classes;
    this.pageBody = pageBody;
  }

  isOpen() {
    return this.elements.container.classList.contains(this.classes.ACTIVE);
  }

  open() {
    this.elements.container.classList.add(this.classes.ACTIVE);
    this.pageBody.style.overflow = "hidden";
  }

  close() {
    this.elements.container.classList.remove(this.classes.ACTIVE);
    this.pageBody.style.overflow = "";
  }

  showItem(item) {
    this.applyReservedMediaSize(item);
    this.elements.img.src = getLargestVersionUrl(item.versions, "jpg") || item.original;
    this.elements.caption.textContent = formatPhotoTitle(item.filename);
    this.triggerFadeAnimation();
  }

  setMediaLoadingState(isLoading) {
    this.elements.img.classList.toggle("is-loading", isLoading);
  }

  applyReservedMediaSize(item) {
    const width = Number(item?.width);
    const height = Number(item?.height);

    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      this.elements.img.width = width;
      this.elements.img.height = height;
      this.elements.img.style.aspectRatio = `${width} / ${height}`;
      return;
    }

    const aspectRatio = Number(item?.aspectRatio);
    this.elements.img.style.aspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0
      ? `${aspectRatio} / 1`
      : "3 / 2";
  }

  triggerFadeAnimation() {
    [this.elements.img, this.elements.info].forEach((el) => {
      el.classList.remove(this.classes.FADE_IN);
      void el.offsetWidth;
      el.classList.add(this.classes.FADE_IN);
    });
  }
}

class Lightbox {
  constructor({ galleryData, view, metadataReader, metadataRenderer, openEventName, eventTarget = document, keyTarget = document }) {
    this.galleryData = galleryData;
    this.view = view;
    this.metadataReader = metadataReader;
    this.metadataRenderer = metadataRenderer;
    this.openEventName = openEventName;
    this.eventTarget = eventTarget;
    this.keyTarget = keyTarget;
    this.currentIndex = 0;
    this.pendingImageRequestId = 0;

    this.initEventListeners();
  }

  initEventListeners() {
    this.eventTarget.addEventListener(this.openEventName, (e) => {
      this.open(e.detail.index);
    });

    this.view.elements.closeBtn.addEventListener("click", () => this.close());
    this.view.elements.prevBtn.addEventListener("click", (e) => this.showPrev(e));
    this.view.elements.nextBtn.addEventListener("click", (e) => this.showNext(e));

    this.view.elements.container.addEventListener("click", (e) => {
      if (e.target === this.view.elements.container) this.close();
    });

    this.keyTarget.addEventListener("keydown", (e) => {
      if (!this.view.isOpen()) return;
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowRight") this.showNext();
      if (e.key === "ArrowLeft") this.showPrev();
    });
  }

  open(index) {
    this.currentIndex = index;
    this.updateImage();
    this.view.open();
  }

  close() {
    this.view.close();
  }

  showNext(e) {
    if (e) e.stopPropagation();
    this.currentIndex = (this.currentIndex + 1) % this.galleryData.length;
    this.updateImage();
  }

  showPrev(e) {
    if (e) e.stopPropagation();
    this.currentIndex = (this.currentIndex - 1 + this.galleryData.length) % this.galleryData.length;
    this.updateImage();
  }

  async updateImage() {
    const item = this.galleryData[this.currentIndex];
    const requestId = ++this.pendingImageRequestId;

    this.view.setMediaLoadingState(true);
    this.view.showItem(item);
    this.metadataRenderer.renderLoading(this.view.elements.metadata);

    await this.waitForImageSettled(requestId);

    const metadata = await this.metadataReader.read(item.original);
    if (this.isStaleRequest(requestId, item)) return;
    this.metadataRenderer.render(this.view.elements.metadata, metadata);
  }

  waitForImageSettled(requestId) {
    return new Promise((resolve) => {
      const img = this.view.elements.img;

      const done = () => {
        if (requestId === this.pendingImageRequestId) {
          this.view.setMediaLoadingState(false);
        }
        resolve();
      };

      if (img.complete && img.naturalWidth > 0) return done();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }

  isStaleRequest(requestId, item) {
    return requestId !== this.pendingImageRequestId ||
      this.galleryData[this.currentIndex].original !== item.original;
  }
}

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
