import { formatPhotoTitle, createElement, getVersionSrcset } from "./utils.js";

export class GalleryDataSource {
  constructor(dataUrl) {
    this.dataUrl = dataUrl;
  }

  async load() {
    const response = await fetch(this.dataUrl);
    if (!response.ok) throw new Error("Failed to load gallery data");
    return response.json();
  }
}

export class GalleryItemRenderer {
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

export class Gallery {
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
