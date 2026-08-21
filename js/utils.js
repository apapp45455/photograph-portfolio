/**
 * @typedef {Object} ImageVersion
 * @property {string} jpg
 * @property {string} webp
 * @property {number} width
 */

/**
 * @typedef {Object} GalleryItem
 * @property {string} filename
 * @property {?string} series - id of the series this photo belongs to, or null
 * @property {string} original
 * @property {number} width
 * @property {number} height
 * @property {number} aspectRatio
 * @property {Object.<string, ImageVersion>} versions
 */

/**
 * @typedef {Object} SeriesPhoto
 * @property {string} filename
 * @property {"full"|"half"} span
 * @property {string} caption
 */

/**
 * @typedef {Object} Series
 * @property {string} id
 * @property {string} title
 * @property {string} titleZh
 * @property {string} period
 * @property {string} summary
 * @property {string} page
 * @property {number} count
 * @property {?GalleryItem} cover
 * @property {SeriesPhoto[]} photos
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

/**
 * Prefixes a manifest-relative path so pages served from a subdirectory
 * (projects/*.html) resolve assets against the site root.
 */
export function withAssetBase(assetBase, relativePath) {
  if (!assetBase || !relativePath) return relativePath;
  return `${assetBase}${relativePath}`;
}

/**
 * Rewrites every asset path on a gallery entry through withAssetBase, so the
 * rest of the app can stay unaware of where the page lives.
 */
export function rebaseGalleryItem(item, assetBase) {
  if (!assetBase) return item;

  const versions = Object.fromEntries(
    Object.entries(item.versions || {}).map(([tier, version]) => [tier, {
      ...version,
      jpg: withAssetBase(assetBase, version.jpg),
      webp: withAssetBase(assetBase, version.webp),
    }])
  );

  return { ...item, original: withAssetBase(assetBase, item.original), versions };
}
