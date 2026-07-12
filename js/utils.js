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

export function formatPhotoTitle(filename) {
  return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
}

export function createElement(tagName, { className, textContent } = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent !== undefined) element.textContent = textContent;
  return element;
}

function getSortedVersions(versions) {
  return Object.values(versions).sort((a, b) => a.width - b.width);
}

export function getVersionSrcset(versions, format) {
  return getSortedVersions(versions)
    .filter((version) => version[format])
    .map((version) => `${version[format]} ${version.width}w`)
    .join(", ");
}

export function getLargestVersionUrl(versions, format) {
  const sortedVersions = getSortedVersions(versions).filter((version) => version[format]);
  return sortedVersions.at(-1)?.[format];
}
