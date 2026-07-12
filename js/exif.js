import { createElement } from "./utils.js";

export class ExifMetadataReader {
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
