import { createElement } from "./utils.js";

const EXIF_CDN = "https://cdn.jsdelivr.net/npm/exif-js";

/** In-flight or successful fetch, shared by every read; cleared whenever a load
 *  produced no reader, so the next open tries again. */
let exifApiRequest = null;

/**
 * exif-js is loaded on the first lightbox open rather than from a <script> tag.
 * A deferred tag joins the same ordered list as the module entry point, and
 * DOMContentLoaded — which gates App.start(), the series cover it builds, and so the
 * LCP element — does not fire until that list drains. That put cdn.jsdelivr.net on
 * the critical path for a library nothing needs until a photo is opened.
 */
function loadExifApi() {
  if (window.EXIF) return Promise.resolve(window.EXIF);

  exifApiRequest = exifApiRequest || new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = EXIF_CDN;
    // Both handlers route through here, because `error` is the rarer failure. A
    // classic script only fires it when the *fetch* fails; a captive portal or a
    // filter answering 200 text/html is fetched and executed, the parse error goes
    // to window.onerror, and the element fires `load` with window.EXIF still
    // undefined. Resetting only in onerror would leave that case caching a settled
    // null — metadata dead for the rest of the visit, which is the state the retry
    // exists to prevent, reached by the way phones actually fail.
    const settle = (api) => {
      if (!api) {
        exifApiRequest = null;
        script.remove(); // else a blocked CDN leaves one dead tag per open
      }
      resolve(api);
    };
    // Safe to assign above: the `exifApiRequest =` below has completed by the time
    // either handler fires.
    script.onload = () => settle(window.EXIF || null);
    script.onerror = () => settle(null);
    document.head.appendChild(script);
  });

  return exifApiRequest;
}

export class ExifMetadataReader {
  constructor({
    exifApi = null,
    loadApi = loadExifApi,
    imageFactory = () => new Image(),
    protocol = window.location.protocol,
  } = {}) {
    // exifApi short-circuits the fetch when a caller supplies its own reader.
    this.exifApi = exifApi;
    this.loadApi = loadApi;
    this.imageFactory = imageFactory;
    this.protocol = protocol;
  }

  async read(originalSrc) {
    if (this.protocol === "file:") {
      return { status: "error", message: "Metadata unavailable in local file mode." };
    }

    // Started together: the script is ~6KB and the original is megabytes, so the
    // fetch is free next to the image it is waiting on anyway.
    const apiRequest = this.exifApi ? Promise.resolve(this.exifApi) : this.loadApi();
    const tempImg = await this.loadImage(originalSrc);
    if (!tempImg) return { status: "error", message: "Failed to load metadata" };

    const exif = await apiRequest;
    if (!exif) return { status: "error", message: "Metadata reader unavailable" };

    return new Promise((resolve) => {
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
    });
  }

  /** Resolves with the loaded <img>, or null if it could not be fetched. */
  loadImage(src) {
    return new Promise((resolve) => {
      const img = this.imageFactory();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
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

export class MetadataRenderer {
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
