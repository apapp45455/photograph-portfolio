import { formatPhotoTitle, getLargestVersionUrl, getVersionSrcset } from "./utils.js";

/**
 * An upper bound on the rendered width, not an exact one: `.lightbox-img` is also
 * capped by max-height (50vh stacked, 80vh side by side), so a landscape photo is
 * often narrower than this. Over-stating it can only make the browser pick one tier
 * up, which costs bytes and never quality — understating it would show a soft photo
 * at full screen, which is the whole point of the lightbox. Tracks the two widths in
 * style.css: `max-width: 100%` of a 90vw wrapper below 900px, `max-width: 70vw` above.
 */
const LIGHTBOX_SIZES = "(max-width: 900px) 90vw, 70vw";

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
    // The <source> is filled first, and only then the <img src>: the img is already in
    // the DOM, so setting src against a stale/empty source starts a JPEG fetch the WebP
    // then supersedes. getVersionSrcset escapes the space and comma that are srcset's
    // own delimiters — `images/Canon R50特寫.jpg` is why that is not written twice.
    //
    // This offered one candidate, the 1920px one, at every viewport: a phone displaying
    // the photo 351px wide took 276KB where 102KB covers it, and paging the five-photo
    // japan series cost 2003KB against 767KB. src stays on the largest as the fallback
    // for a browser that ignores srcset entirely.
    this.elements.webpSource.srcset = getVersionSrcset(item.versions, "webp");
    this.elements.webpSource.sizes = LIGHTBOX_SIZES;
    this.elements.img.srcset = getVersionSrcset(item.versions, "jpg");
    this.elements.img.sizes = LIGHTBOX_SIZES;
    this.elements.img.src = getLargestVersionUrl(item.versions, "jpg") || item.original;
    // Series photos already carry an editorial caption; fall back to the filename only
    // for the home grid, which has none.
    const label = item.caption || formatPhotoTitle(item.filename);
    this.elements.caption.textContent = label;
    // The static alt="Enlarged view" would otherwise name every photo identically.
    this.elements.img.alt = item.alt || label;
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

    // Metadata comes off the manifest already in memory, so it renders in the same
    // task as showItem. There is no request left to arrive out of order, which is why
    // the stale-metadata guard that used to follow this line is gone; the "Loading
    // metadata…" placeholder went with it, since nothing is loading. requestId still
    // matters below — the *image* does still race.
    this.metadataRenderer.render(this.view.elements.metadata, this.metadataReader.read(item));

    await this.waitForImageSettled(requestId);
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

}
