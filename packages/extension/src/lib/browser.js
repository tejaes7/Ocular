/**
 * Which Chromium browser are we running in?
 *
 * Ocular is a plain MV3 extension, so Chrome, Edge and Brave all run the same
 * build with no compatibility shims — every API it touches (storage, alarms,
 * notifications, offscreen, scripting, tabs, downloads, idle) is standard
 * Chromium. The only thing that genuinely differs is what we *tell* people:
 * each browser exposes its extensions page on its own scheme, and sending
 * someone to chrome://extensions in Edge lands them nowhere.
 *
 * Detection is deliberately shallow. It only ever picks a label and a URL to
 * show, never gates behaviour — so a wrong guess costs a slightly odd sentence,
 * not a broken feature.
 */

/**
 * Brave hides itself from the user agent on purpose; `navigator.brave` is the
 * documented way to spot it. The method is async, but its mere presence is
 * enough for a label, and staying synchronous keeps this usable from render
 * paths that cannot await.
 */
function isBrave() {
  return typeof navigator !== 'undefined' && Boolean(navigator.brave);
}

/** Edge is the one Chromium fork that still marks itself in the UA, as `Edg/`. */
function isEdge() {
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands)) {
    return brands.some((b) => /edge/i.test(b.brand));
  }
  return /\bEdg\//.test(navigator.userAgent || '');
}

/** Display name: "Brave", "Edge" or "Chrome". */
export function browserName() {
  if (isBrave()) return 'Brave';
  if (isEdge()) return 'Edge';
  return 'Chrome';
}

/** The extensions page for this browser, e.g. `edge://extensions`. */
export function extensionsUrl() {
  if (isBrave()) return 'brave://extensions';
  if (isEdge()) return 'edge://extensions';
  return 'chrome://extensions';
}
