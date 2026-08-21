import { createElement } from "./utils.js";

/**
 * Formats the EXIF `generate-gallery.js` parsed at build time and wrote into
 * `js/gallery-data.json`.
 *
 * It used to parse the header in the browser via exif-js, which meant fetching
 * `item.original` — the full-resolution file, up to 3.5MB — for a photo the lightbox
 * displays at 459KB, and again on every next/prev. Across the 18 photos that was
 * 30,884KB fetched against 6,911KB shown. Nothing is fetched now, so this is also the
 * reason there is no exif-js <script> tag and no CDN request on any page.
 */
export class ExifMetadataReader {
  /**
   * @param {GalleryItem} item - manifest entry; `item.exif` is null when the source
   *   had no parseable header.
   * @returns {{status: "ready"|"empty", values?: object, message?: string}}
   */
  read(item) {
    const exif = item && item.exif;
    if (!exif) return { status: "empty", message: "No EXIF data found" };

    const values = {
      camera: [exif.make, exif.model].filter(Boolean).join(" "),
      aperture: ExifMetadataReader.formatAperture(exif.fNumber),
      shutter: ExifMetadataReader.formatShutterSpeed(exif.exposureTime),
      iso: exif.iso || "--",
      focal: ExifMetadataReader.formatFocalLength(exif.focalLength),
    };

    const hasMetadata = values.camera || values.aperture !== "--" || values.shutter !== "--" ||
      values.iso !== "--" || values.focal !== "--";

    return hasMetadata
      ? { status: "ready", values }
      : { status: "empty", message: "No EXIF data found" };
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
