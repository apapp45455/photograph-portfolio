import { formatPhotoTitle, createElement, getVersionSrcset, rebaseGalleryItem } from "./utils.js";

export class GalleryDataSource {
  constructor(dataUrl, assetBase = "") {
    this.dataUrl = dataUrl;
    this.assetBase = assetBase;
  }

  async load() {
    const response = await fetch(this.dataUrl);
    if (!response.ok) throw new Error("Failed to load gallery data");
    const data = await response.json();
    // Paths in the manifest are root-relative; a page in projects/ needs them rebased
    // once here so renderers, the lightbox and the EXIF reader all agree.
    return data.map((item) => rebaseGalleryItem(item, this.assetBase));
  }
}

export class GalleryItemRenderer {
  constructor({ breakpoints, classes, sizes }) {
    this.breakpoints = breakpoints;
    this.classes = classes;
    this.sizes = sizes;
  }

  render(item, index) {
    const wrapper = createElement("div", { className: this.classes.GALLERY_ITEM_WRAPPER });
    this.markOpenable(wrapper, index);
    wrapper.appendChild(this.createPicture(item));
    return wrapper;
  }

  /**
   * A tile opens the lightbox, so it has to be reachable and operable by keyboard —
   * otherwise the dialog is a properly built one that no keyboard user can enter.
   * The accessible name comes from the contained <img>'s alt.
   */
  markOpenable(element, index) {
    element.dataset.index = index;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    return element;
  }

  createPicture(item) {
    const picture = document.createElement("picture");
    picture.appendChild(this.createSource("image/webp", item, "webp"));
    picture.appendChild(this.createSource("image/jpeg", item, "jpg"));

    // src is assigned last, once the <source> elements are already in the DOM:
    // setting it on a detached <img> starts a JPEG fetch that the WebP source then
    // supersedes on insertion, costing one wasted request per photo.
    const img = this.createImage(item);
    picture.appendChild(img);
    img.src = item.versions.thumb.jpg;

    return picture;
  }

  defaultSizes() {
    return `(max-width: ${this.breakpoints.MOBILE}px) 100vw, (max-width: ${this.breakpoints.TABLET}px) 50vw, 33vw`;
  }

  createSource(type, item, format) {
    const source = document.createElement("source");
    source.type = type;
    source.srcset = getVersionSrcset(item.versions, format);
    source.sizes = this.sizes ? this.sizes(item) : this.defaultSizes();
    return source;
  }

  /** Everything but `src` — see createPicture for why that is set afterwards. */
  createImage(item) {
    const img = document.createElement("img");
    img.alt = formatPhotoTitle(item.filename);
    img.classList.add(this.classes.GALLERY_ITEM);
    img.loading = "lazy";
    img.width = item.width;
    img.height = item.height;
    img.onload = () => img.classList.add(this.classes.LOADED);
    return img;
  }
}

export class Gallery {
  constructor({ container, dataSource, itemRenderer, classes, openEventName, eventTarget = document, select }) {
    this.container = container;
    this.dataSource = dataSource;
    this.itemRenderer = itemRenderer;
    this.classes = classes;
    this.openEventName = openEventName;
    this.eventTarget = eventTarget;
    // Narrows/reorders the manifest for this page (home grid vs. a series page).
    // Whatever it returns is both what gets rendered and what the lightbox pages through.
    this.select = select || ((data) => data);
    this.data = [];
  }

  async init() {
    try {
      this.data = this.select(await this.dataSource.load());
      this.initEventDelegation();
      this.render();
    } catch (error) {
      console.error("Error initializing gallery:", error);
      this.renderError("Failed to load images. Please try again later.");
    }
  }

  initEventDelegation() {
    this.container.addEventListener("click", (e) => this.requestOpen(e.target));

    this.container.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      // Space scrolls the page by default, which is not what a button does.
      if (this.requestOpen(e.target)) e.preventDefault();
    });
  }

  requestOpen(target) {
    const wrapper = target.closest(`.${this.classes.GALLERY_ITEM_WRAPPER}`);
    if (!wrapper || wrapper.dataset.index === undefined) return false;

    this.eventTarget.dispatchEvent(new CustomEvent(this.openEventName, {
      detail: { index: parseInt(wrapper.dataset.index, 10) },
    }));
    return true;
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
