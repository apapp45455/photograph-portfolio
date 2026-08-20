import { formatPhotoTitle, getLargestVersionUrl } from "./utils.js";

export class LightboxView {
  constructor(elements, classes, pageBody = document.body) {
    this.elements = elements;
    this.classes = classes;
    this.pageBody = pageBody;
  }

  isOpen() {
    return this.elements.container.classList.contains(this.classes.ACTIVE);
  }

  open() {
    // Remember where focus came from so Esc can hand it back instead of dropping
    // the user at the top of the document.
    this.previouslyFocused = document.activeElement;
    this.elements.container.classList.add(this.classes.ACTIVE);
    this.pageBody.style.overflow = "hidden";
    this.elements.closeBtn.focus();
  }

  close() {
    this.elements.container.classList.remove(this.classes.ACTIVE);
    this.pageBody.style.overflow = "";
    if (this.previouslyFocused && typeof this.previouslyFocused.focus === "function") {
      this.previouslyFocused.focus();
    }
  }

  /**
   * aria-modal tells assistive tech the rest of the page is inert, so Tab must not
   * be able to reach it. Cycle through the dialog's own controls instead.
   */
  trapFocus(event) {
    const focusable = [this.elements.closeBtn, this.elements.prevBtn, this.elements.nextBtn];
    const current = focusable.indexOf(document.activeElement);
    const step = event.shiftKey ? -1 : 1;

    event.preventDefault();
    focusable[(Math.max(current, 0) + step + focusable.length) % focusable.length].focus();
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

export class Lightbox {
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
      if (e.key === "Tab") this.view.trapFocus(e);
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
