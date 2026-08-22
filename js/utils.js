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
 * @property {?{make: ?string, model: ?string, fNumber: ?number, exposureTime: ?number, iso: ?number, focalLength: ?number}} exif
 *   - parsed by generate-gallery.js; null when the source had no readable header
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

/**
 * A srcset candidate is `<url> <descriptor>`, candidates separated by commas — so a URL
 * containing either character splits into tokens the parser cannot read, and the
 * candidate is discarded.
 *
 * The discard is per *candidate*, not per element: a srcset whose second entry carries a
 * space still serves its first (verified in Chrome). What made `images/Canon R50特寫.jpg`
 * fatal is that every tier is named after the same file, so one space invalidated all
 * three candidates at once — both <source> elements were left with nothing usable, were
 * skipped, and every viewport fell back to the <img src> 400px thumb, blown up to a
 * 1170px box on a 3x phone.
 *
 * `%` is deliberately not escaped, which keeps this idempotent: re-running it over an
 * already-encoded path cannot double-encode one.
 *
 * Only those two characters are escaped. CJK needs no encoding to parse, and leaving it
 * alone keeps the manifest and index.html's hand-written cover preload readable —
 * checkHomePreload builds its expected value by *calling* this function, so anything
 * escaped here has to be typed into that preload by hand to keep the check green.
 */
function toSrcsetUrl(url) {
  return url.replace(/[\s,]/g, (char) => encodeURIComponent(char));
}

/**
 * @param {?string[]} tiers - restrict the candidates to these tiers, smallest-first;
 *   omit for all of them. The home grid passes a subset: its tiles are never wide
 *   enough to earn `large`, but a 3x phone at 100vw computes 1170px and would pick it.
 */
export function getVersionSrcset(versions, format, tiers = null) {
  const candidates = tiers
    ? Object.fromEntries(Object.entries(versions).filter(([tier]) => tiers.includes(tier)))
    : versions;

  return getSortedVersions(candidates)
    .filter((version) => version[format])
    .map((version) => `${toSrcsetUrl(version[format])} ${version.width}w`)
    .join(", ");
}

/**
 * `sizes` for a home-page series cover. Exported rather than inlined in
 * SeriesCardRenderer because index.html preloads that image and
 * scripts/check-gallery.js asserts the two agree — one string, three readers.
 * A mismatch is worse than no preload: the browser fetches both candidates.
 */
export function seriesCoverSizes(breakpoints) {
  return `(max-width: ${breakpoints.TABLET}px) calc(100vw - 40px), (max-width: 1440px) 55vw, 782px`;
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
