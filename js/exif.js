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
      camera: ExifMetadataReader.formatCamera(exif.make, exif.model),
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

  /**
   * Canon writes Make "Canon" and Model "Canon EOS R50", so joining them read
   * "Canon Canon EOS R50". A model that already names its maker stands alone.
   * Not a general de-duplication: "JK Imaging, Ltd." / "KODAK PIXPRO C1" is an OEM
   * legal name against a brand, which no string rule can collapse correctly, so it
   * keeps both rather than guessing.
   */
  static formatCamera(make, model) {
    if (!model) return make || "";
    if (!make) return model;
    return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`;
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
    // Only "ready" and "empty" reach here. The three cases that produced "error" —
    // the file: protocol, a failed image load, an unavailable reader — were all
    // deleted along with the fetch, so a "metadata-error" branch would be unreachable.
    if (metadata.status !== "ready") {
      container.replaceChildren(createElement("div", {
        className: "metadata-empty",
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
