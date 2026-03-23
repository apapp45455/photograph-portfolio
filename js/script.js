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
  }
};

/**
 * Utility class for extracting and formatting EXIF data.
 */
class ExifManager {
  static async getFormattedMetadata(originalSrc) {
    if (window.location.protocol === "file:") {
      return '<div class="metadata-error">Metadata unavailable in local file mode.</div>';
    }

    return new Promise((resolve) => {
      const tempImg = new Image();
      tempImg.src = originalSrc;

      tempImg.onload = function () {
        // @ts-ignore
        EXIF.getData(this, function () {
          const make = EXIF.getTag(this, "Make") || "";
          const model = EXIF.getTag(this, "Model") || "";
          const fNumberTag = EXIF.getTag(this, "FNumber");
          const exposureTime = EXIF.getTag(this, "ExposureTime");
          const iso = EXIF.getTag(this, "ISOSpeedRatings");
          const focalLengthTag = EXIF.getTag(this, "FocalLength");

          if (!make && !model && !fNumberTag && !exposureTime && !iso && !focalLengthTag) {
            resolve('<div class="metadata-empty">No EXIF data found</div>');
            return;
          }

          const fNumber = fNumberTag ? `f/${parseFloat(fNumberTag).toFixed(1)}` : "--";
          const focalLength = focalLengthTag ? `${parseFloat(focalLengthTag).toFixed(0)}mm` : "--";
          const shutterSpeed = ExifManager.formatShutterSpeed(exposureTime);

          resolve(`
            <div class="metadata-grid">
              <div class="metadata-item"><span class="label">Camera</span><span class="value">${make} ${model}</span></div>
              <div class="metadata-item"><span class="label">Aperture</span><span class="value">${fNumber}</span></div>
              <div class="metadata-item"><span class="label">Shutter</span><span class="value">${shutterSpeed}</span></div>
              <div class="metadata-item"><span class="label">ISO</span><span class="value">${iso || "--"}</span></div>
              <div class="metadata-item"><span class="label">Focal</span><span class="value">${focalLength}</span></div>
            </div>
          `);
        });
      };

      tempImg.onerror = () => resolve('<div class="metadata-error">Failed to load metadata</div>');
    });
  }

  static formatShutterSpeed(exposureTime) {
    if (!exposureTime) return "--";
    if (exposureTime >= 1) return `${exposureTime}s`;
    return `1/${Math.round(1 / exposureTime)}s`;
  }
}

/**
 * Manages the lightbox UI and interactions.
 * Decoupled: Listens for custom events to trigger opening.
 */
class Lightbox {
  constructor(galleryData) {
    this.galleryData = galleryData;
    this.currentIndex = 0;

    this.elements = {
      container: document.querySelector(CONFIG.SELECTORS.LIGHTBOX),
      img: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_IMG),
      info: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_INFO),
      caption: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_CAPTION),
      metadata: document.querySelector(CONFIG.SELECTORS.LIGHTBOX_METADATA),
      closeBtn: document.querySelector(CONFIG.SELECTORS.CLOSE_BTN),
      prevBtn: document.querySelector(CONFIG.SELECTORS.PREV_BTN),
      nextBtn: document.querySelector(CONFIG.SELECTORS.NEXT_BTN),
    };

    this.initEventListeners();
  }

  initEventListeners() {
    // Listen for custom open event (Decoupling)
    document.addEventListener(CONFIG.EVENTS.OPEN_LIGHTBOX, (e) => {
      this.open(e.detail.index);
    });

    this.elements.closeBtn.addEventListener("click", () => this.close());
    this.elements.prevBtn.addEventListener("click", (e) => this.showPrev(e));
    this.elements.nextBtn.addEventListener("click", (e) => this.showNext(e));

    this.elements.container.addEventListener("click", (e) => {
      if (e.target === this.elements.container) this.close();
    });

    document.addEventListener("keydown", (e) => {
      if (!this.isOpen()) return;
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowRight") this.showNext();
      if (e.key === "ArrowLeft") this.showPrev();
    });
  }

  isOpen() {
    return this.elements.container.classList.contains(CONFIG.CLASSES.ACTIVE);
  }

  open(index) {
    this.currentIndex = index;
    this.updateImage();
    this.elements.container.classList.add(CONFIG.CLASSES.ACTIVE);
    document.body.style.overflow = "hidden";
  }

  close() {
    this.elements.container.classList.remove(CONFIG.CLASSES.ACTIVE);
    document.body.style.overflow = "";
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
    const fullPath = item.versions.large.jpg || item.original;

    this.elements.img.src = fullPath;
    this.elements.caption.textContent = item.filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    this.elements.metadata.innerHTML = '<div class="metadata-loading">Loading metadata...</div>';

    this.triggerFadeAnimation();

    const metadataHtml = await ExifManager.getFormattedMetadata(item.original);
    if (this.galleryData[this.currentIndex].original === item.original) {
      this.elements.metadata.innerHTML = metadataHtml;
    }
  }

  triggerFadeAnimation() {
    [this.elements.img, this.elements.info].forEach((el) => {
      el.classList.remove(CONFIG.CLASSES.FADE_IN);
      void el.offsetWidth;
      el.classList.add(CONFIG.CLASSES.FADE_IN);
    });
  }
}

/**
 * Main Gallery class responsible for initialization and rendering.
 * High Performance: Uses Event Delegation and Decoupled Events.
 */
class Gallery {
  constructor() {
    this.container = document.querySelector(CONFIG.SELECTORS.GALLERY);
    this.data = [];
  }

  async init() {
    try {
      const response = await fetch(CONFIG.PATHS.GALLERY_DATA);
      if (!response.ok) throw new Error("Failed to load gallery data");

      this.data = await response.json();
      this.initEventDelegation();
      this.render();
    } catch (error) {
      console.error("Error initializing gallery:", error);
      this.container.innerHTML = `<p class="${CONFIG.CLASSES.ERROR}">Failed to load images. Please try again later.</p>`;
    }
  }

  /**
   * Performance: Use Event Delegation instead of binding to every single item.
   */
  initEventDelegation() {
    this.container.addEventListener("click", (e) => {
      const wrapper = e.target.closest(`.${CONFIG.CLASSES.GALLERY_ITEM_WRAPPER}`);
      if (wrapper && wrapper.dataset.index !== undefined) {
        // Architecture: Dispatch custom event instead of calling Lightbox directly
        const event = new CustomEvent(CONFIG.EVENTS.OPEN_LIGHTBOX, {
          detail: { index: parseInt(wrapper.dataset.index, 10) }
        });
        document.dispatchEvent(event);
      }
    });
  }

  render() {
    const fragment = document.createDocumentFragment();

    this.data.forEach((item, index) => {
      const wrapper = this.createGalleryItem(item, index);
      fragment.appendChild(wrapper);
    });

    this.container.appendChild(fragment);
  }

  createGalleryItem(item, index) {
    const wrapper = document.createElement("div");
    wrapper.classList.add(CONFIG.CLASSES.GALLERY_ITEM_WRAPPER);
    wrapper.dataset.index = index; // Store index for event delegation

    const picture = document.createElement("picture");

    // WebP Source
    const sourceWebp = this.createSource(
      "image/webp",
      `${item.versions.thumb.webp} 400w, ${item.versions.medium.webp} 1080w`
    );

    // JPG Source
    const sourceJpg = this.createSource(
      "image/jpeg",
      `${item.versions.thumb.jpg} 400w, ${item.versions.medium.jpg} 1080w`
    );

    // Fallback Image
    const img = document.createElement("img");
    img.src = item.versions.thumb.jpg;
    img.alt = item.filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    img.classList.add(CONFIG.CLASSES.GALLERY_ITEM);
    img.loading = "lazy";
    img.width = item.width;
    img.height = item.height;

    img.onload = () => img.classList.add(CONFIG.CLASSES.LOADED);

    picture.appendChild(sourceWebp);
    picture.appendChild(sourceJpg);
    picture.appendChild(img);
    wrapper.appendChild(picture);

    return wrapper;
  }

  createSource(type, srcset) {
    const source = document.createElement("source");
    source.type = type;
    source.srcset = srcset;
    source.sizes = `(max-width: ${CONFIG.BREAKPOINTS.MOBILE}px) 100vw, (max-width: ${CONFIG.BREAKPOINTS.TABLET}px) 50vw, 33vw`;
    return source;
  }
}

// Start the application independently
document.addEventListener("DOMContentLoaded", async () => {
  const gallery = new Gallery();
  
  // Wait for data to load to initialize Lightbox (since it needs the data list)
  await gallery.init();
  
  if (gallery.data.length > 0) {
    new Lightbox(gallery.data);
  }
});
