/**
 * Storage layer over chrome.storage.local.
 *
 * Layout:
 *   settings       -> Settings
 *   products       -> { [id]: TrackedProduct }
 *   hist:<id>      -> PricePoint[]   separate keys so a long history never
 *                                    forces a rewrite of the product index
 *   hosts          -> { [hostname]: HostState }   which check strategy works
 *   selectors      -> { [hostname]: string }      AI-learned selectors (unused for now)
 *   deviceId       -> string                      anonymous id for optional sync
 *   meta           -> { schemaVersion, installedAt, lastBackupAt }
 */

export const SCHEMA_VERSION = 2;

const SETTINGS_KEY = 'settings';
const PRODUCTS_KEY = 'products';
const HOSTS_KEY = 'hosts';
const SELECTORS_KEY = 'selectors';
const DEVICE_KEY = 'deviceId';
const META_KEY = 'meta';
const HISTORY_PREFIX = 'hist:';

// Headroom for a multi-month collection run. At a 30-minute interval a product
// that changes price on every single check writes ~48 rows/day, which exhausted
// the old 2000-row cap in about six weeks — silently, by dropping the oldest
// rows, which are the most valuable ones for establishing a baseline price.
// Compaction means a well-behaved product uses a tiny fraction of this.
const MAX_HISTORY_POINTS = 20000;

export const DEFAULT_SETTINGS = {
  checkIntervalMinutes: 180,
  maxChecksPerSweep: 25,

  notifyOnAnyDrop: true,
  // A real price move is a few percent at minimum. The old default of 1% meant
  // any extraction wobble became a notification, and because this rule compares
  // against the previous reading rather than the median, it is the one alert
  // path with no protection against a bad reading.
  minDropPercentToNotify: 5,

  // Hidden-tab checking: the answer to retailers blocking plain fetch.
  tabChecks: true,
  tabChecksOnlyWhenIdle: true,

  autoBackup: true,
  backupIntervalDays: 7,

  sync: {
    enabled: false,
    endpoint: '',
  },

  // AI is out of scope for now; the pipeline never calls it while provider is 'off'.
  ai: {
    provider: 'off',
    apiKey: '',
    model: '',
  },
};

async function read(key, fallback) {
  const bag = await chrome.storage.local.get(key);
  return bag[key] ?? fallback;
}

// --- settings --------------------------------------------------------------

export async function getSettings() {
  const stored = await read(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ai: { ...DEFAULT_SETTINGS.ai, ...(stored.ai || {}) },
    sync: { ...DEFAULT_SETTINGS.sync, ...(stored.sync || {}) },
  };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

// --- meta ------------------------------------------------------------------

export async function getMeta() {
  return read(META_KEY, { schemaVersion: SCHEMA_VERSION, installedAt: Date.now(), lastBackupAt: 0 });
}

export async function saveMeta(patch) {
  const next = { ...(await getMeta()), ...patch };
  await chrome.storage.local.set({ [META_KEY]: next });
  return next;
}

/** Stable anonymous id, generated on first use. Never tied to an account. */
export async function getDeviceId() {
  let id = await read(DEVICE_KEY, null);
  if (!id) {
    id = crypto.randomUUID();
    await chrome.storage.local.set({ [DEVICE_KEY]: id });
  }
  return id;
}

// --- products --------------------------------------------------------------

/** Stable id derived from the canonical URL, so re-adding is idempotent. */
export function productId(canonicalUrl) {
  let hash = 5381;
  for (let i = 0; i < canonicalUrl.length; i++) {
    hash = ((hash << 5) + hash + canonicalUrl.charCodeAt(i)) | 0;
  }
  return `p${(hash >>> 0).toString(36)}`;
}

export async function listProducts() {
  const map = await read(PRODUCTS_KEY, {});
  return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getProduct(id) {
  const map = await read(PRODUCTS_KEY, {});
  return map[id] || null;
}

export async function upsertProduct(product) {
  const map = await read(PRODUCTS_KEY, {});
  const id = product.id || productId(product.canonicalUrl);
  map[id] = { ...map[id], ...product, id };
  await chrome.storage.local.set({ [PRODUCTS_KEY]: map });
  return map[id];
}

export async function removeProduct(id) {
  const map = await read(PRODUCTS_KEY, {});
  delete map[id];
  await chrome.storage.local.set({ [PRODUCTS_KEY]: map });
  await chrome.storage.local.remove(HISTORY_PREFIX + id);
}

// --- price history ---------------------------------------------------------

export async function getHistory(id) {
  return read(HISTORY_PREFIX + id, []);
}

export async function setHistory(id, points) {
  await chrome.storage.local.set({ [HISTORY_PREFIX + id]: points });
}

/**
 * Append a price observation.
 *
 * Consecutive identical readings collapse into one point with a moving
 * `lastSeen`, so a product checked hourly for a year is ~12 points, not 8760.
 * Returns the previous distinct price, or null if nothing changed.
 *
 * `strategy` and `confidence` are stored per point, not just on the product.
 * They were previously computed by the extraction ladder and discarded at this
 * boundary, which made a suspect reading indistinguishable from a trustworthy
 * one after the fact — and a training set you cannot filter by provenance is a
 * training set you cannot trust. `source` alone was what made the ₹94.75
 * incident diagnosable at all; these two make it diagnosable without guesswork.
 */
export async function appendPricePoint(id, { price, inStock, source, strategy, confidence }) {
  const key = HISTORY_PREFIX + id;
  const history = await read(key, []);
  const now = Date.now();
  const last = history[history.length - 1];

  if (last && last.price === price && last.inStock === inStock) {
    last.lastSeen = now;
  } else {
    history.push({
      ts: now,
      lastSeen: now,
      price,
      inStock,
      source,
      strategy: strategy || null,
      confidence: confidence || null,
    });
    if (history.length > MAX_HISTORY_POINTS) {
      const dropped = history.length - MAX_HISTORY_POINTS;
      // Say so. The oldest rows are the ones that establish what a product
      // normally costs, so losing them quietly skews the median in exactly the
      // direction that makes a bad price look normal.
      console.warn(
        `Ocular: history for ${id} hit ${MAX_HISTORY_POINTS} points; dropping the oldest ${dropped}. ` +
          'Compaction should make this unreachable — a product that gets here is being misread.'
      );
      history.splice(0, dropped);
    }
  }

  await chrome.storage.local.set({ [key]: history });
  return last && last.price !== price ? last.price : null;
}

// summarizeHistory() moved to @ocular/shared/history — the backend and the AI
// service need the identical calculation, and a divergent "usual price" would
// make the extension and the server disagree about what counts as a deal.

// --- per-host check strategy ----------------------------------------------

const DEFAULT_HOST_STATE = { strategy: null, failures: 0, blockedUntil: 0, lastOkAt: 0 };

export async function getHostState(hostname) {
  const map = await read(HOSTS_KEY, {});
  return { ...DEFAULT_HOST_STATE, ...(map[hostname] || {}) };
}

export async function saveHostState(hostname, patch) {
  const map = await read(HOSTS_KEY, {});
  map[hostname] = { ...DEFAULT_HOST_STATE, ...(map[hostname] || {}), ...patch };
  await chrome.storage.local.set({ [HOSTS_KEY]: map });
  return map[hostname];
}

export async function listHostStates() {
  return read(HOSTS_KEY, {});
}

// --- learned selectors (kept for when AI comes back) ----------------------

export async function getLearnedSelector(hostname) {
  const map = await read(SELECTORS_KEY, {});
  return map[hostname] || null;
}

export async function saveLearnedSelector(hostname, selector) {
  const map = await read(SELECTORS_KEY, {});
  map[hostname] = selector;
  await chrome.storage.local.set({ [SELECTORS_KEY]: map });
}

// --- raw access, for backup/restore ---------------------------------------

export async function dumpAll() {
  return chrome.storage.local.get(null);
}

export async function writeAll(entries) {
  await chrome.storage.local.set(entries);
}

export const KEYS = {
  SETTINGS_KEY,
  PRODUCTS_KEY,
  HOSTS_KEY,
  HISTORY_PREFIX,
  META_KEY,
};
