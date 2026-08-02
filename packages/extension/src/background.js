/**
 * Service worker: scheduling, checking, notifying.
 *
 * Design notes worth reading before changing anything here:
 *
 * - Checks run in the *user's* browser on purpose. Requests carry their real
 *   User-Agent and their session cookies, which is why they aren't captcha'd the
 *   way a datacenter IP is. See checker.js for the fetch -> hidden-tab ladder.
 *
 * - MV3 service workers have no DOM. HTML parsing is delegated to the offscreen
 *   document.
 *
 * - Be polite: one request at a time, randomised gaps, capped per sweep. Ocular
 *   should be indistinguishable from a person browsing slowly.
 */

import { runCheck } from './checker.js';
import { evaluateAlert } from '@ocular/shared/alerts';
import { downloadBackup } from './lib/backup.js';
import { isPlausibleReading, summarizeHistory } from '@ocular/shared/history';
import { canonicalizeUrl, siteLabel } from '@ocular/shared/sites';
import { runSync, syncConfigured } from './lib/sync.js';
import {
  appendPricePoint,
  getHistory,
  getMeta,
  getProduct,
  getSettings,
  listHostStates,
  listProducts,
  productId,
  removeProduct,
  runStorageMigrations,
  saveMeta,
  upsertProduct,
} from './lib/store.js';

const SWEEP_ALARM = 'ocular:sweep';
const BACKUP_ALARM = 'ocular:backup';
const SYNC_ALARM = 'ocular:sync';
const OFFSCREEN_TARGET = 'ocular-offscreen';

const MIN_REQUEST_GAP_MS = 3000;
const MAX_REQUEST_GAP_MS = 9000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const appVersion = () => chrome.runtime.getManifest().version;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // Before anything reads a price: an update may need to repair stored history,
  // and the badge and popup both derive from it.
  await runStorageMigrations().catch((error) => console.warn('Ocular: migration failed —', error));
  await scheduleAlarms();
  await refreshBadge();

  if (reason === 'install') {
    await saveMeta({ installedAt: Date.now() });
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  // Also here, not just onInstalled: a reloaded unpacked extension does not
  // always fire onInstalled, and the migration is a no-op once it has run.
  await runStorageMigrations().catch((error) => console.warn('Ocular: migration failed —', error));
  await scheduleAlarms();
  await refreshBadge();
  // The whole point of sync is the window where Chrome was closed — pull as soon
  // as it opens rather than waiting for the periodic alarm.
  await syncIfEnabled().catch(() => {});
});

async function scheduleAlarms() {
  const settings = await getSettings();
  // chrome.alarms clamps anything under 1 minute in a packed extension.
  const periodInMinutes = Math.max(30, settings.checkIntervalMinutes);

  await chrome.alarms.clear(SWEEP_ALARM);
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes, delayInMinutes: 1 });

  await chrome.alarms.clear(BACKUP_ALARM);
  chrome.alarms.create(BACKUP_ALARM, { periodInMinutes: 60 * 12, delayInMinutes: 30 });

  await chrome.alarms.clear(SYNC_ALARM);
  if (syncConfigured(settings)) {
    // Pulling on browser start is what actually closes the "Chrome was shut"
    // gap; the periodic run just keeps things fresh during a long session.
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 60, delayInMinutes: 2 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) sweep().catch(console.error);
  if (alarm.name === BACKUP_ALARM) maybeAutoBackup().catch(console.error);
  if (alarm.name === SYNC_ALARM) syncIfEnabled().catch(console.error);
});

async function syncIfEnabled() {
  const settings = await getSettings();
  if (!syncConfigured(settings)) return { ok: false, error: 'Sync is off.' };

  const result = await runSync(settings);
  if (!result.ok) {
    console.warn('Ocular: sync failed —', result.error);
    return result;
  }

  await applyCatchUp(result.catchUp || []);
  return result;
}

/**
 * Land what the worker saw while Chrome was shut.
 *
 * This is the step that was missing, and without it the server was pointless
 * from the user's side: prices merged into history, but `lastPrice` was never
 * updated — so the popup, badge and panel kept showing the stale number — and
 * no alert was ever raised, so an overnight price drop arrived as silence.
 *
 * On letting a server reading raise a notification. The rule elsewhere is that
 * guessed readings never wake the user, and these carry no provenance at all,
 * which looks like the same case. It isn't: the worker extracts from JSON-LD and
 * meta tags only (it has no DOM, so the heuristic rung cannot run there), and
 * acceptableServerPoints has already held every one of these to the 90-day
 * median band — a bar structured browser readings are allowed to skip. A server
 * point is structured *and* median-gated, which is strictly more scrutiny than
 * the readings that already notify.
 */
async function applyCatchUp(events) {
  if (!events.length) return;

  for (const event of events) {
    const product = await getProduct(event.productId);
    if (!product) continue;

    const updated = await upsertProduct({
      ...product,
      lastPrice: event.price,
      lastInStock: event.inStock,
      lastVia: 'server',
      lastServerAt: event.ts,
      // `lastCheckedAt` deliberately untouched. It paces the local sweep, and
      // advancing it here would let a steadily-checking worker crowd out the
      // browser's own checks — quietly demoting the source of truth to the side
      // that gets handed regional prices and anti-bot placeholders.
    });

    if (event.previousPrice != null && event.price < event.previousPrice) {
      await maybeNotify(updated, event.previousPrice, event.price, { source: 'server' });
    }
  }

  await refreshBadge();
}

// ---------------------------------------------------------------------------
// Recording observations
// ---------------------------------------------------------------------------

/** Shared by scheduled checks and passive content-script observations. */
async function recordObservation(product, result, source) {
  const stats = summarizeHistory(await getHistory(product.id));

  // The last gate before a reading becomes permanent. Everything upstream is
  // written to prefer failing over guessing, but nothing used to stand here, so
  // a guessed price went straight into storage and into the median. Quarantining
  // costs one skipped data point; storing a bad one costs a corrupted series and
  // a false alert. See isPlausibleReading in @ocular/shared/history.
  const plausible = isPlausibleReading({
    price: result.price,
    strategy: result.strategy,
    confidence: result.confidence,
    stats,
  });

  if (!plausible.ok) {
    console.warn(
      `Ocular: rejected reading for ${product.id} — ${plausible.reason}`,
      plausible.detail || ''
    );
    // Recorded on the product, never in history: the count is a diagnostic, and
    // a rising one means a site's markup has moved and the pack needs attention.
    await upsertProduct({
      ...product,
      lastCheckedAt: Date.now(),
      rejectedReadings: (product.rejectedReadings || 0) + 1,
      lastRejection: {
        at: Date.now(),
        price: result.price,
        reason: plausible.reason,
        detail: plausible.detail || null,
        strategy: result.strategy || null,
        via: result.via || source,
      },
    });
    return { ok: false, code: plausible.reason, detail: plausible.detail };
  }

  const previousPrice = await appendPricePoint(product.id, {
    price: result.price,
    inStock: result.inStock,
    source,
    strategy: result.strategy,
    confidence: result.confidence,
  });

  const updated = await upsertProduct({
    ...product,
    title: result.title || product.title,
    image: result.image || product.image,
    currency: result.currency || product.currency,
    lastPrice: result.price,
    lastInStock: result.inStock,
    lastCheckedAt: Date.now(),
    lastStrategy: result.strategy,
    lastVia: result.via || source,
    status: 'active',
    lastError: null,
    retryAt: 0,
  });

  if (previousPrice != null && result.price < previousPrice) {
    await maybeNotify(updated, previousPrice, result.price, result);
  }

  return { ok: true, price: result.price, previousPrice, via: result.via || source };
}

async function checkAndRecord(id, { manual = false } = {}) {
  const product = await getProduct(id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  if (product.status === 'paused' && !manual) return { ok: false, code: 'paused' };

  const settings = await getSettings();
  const result = await runCheck(product, settings, { manual });

  if (!result.ok) {
    await upsertProduct({
      ...product,
      status: result.deferred ? product.status : 'error',
      lastError: result.code,
      lastCheckedAt: result.deferred ? product.lastCheckedAt : Date.now(),
      retryAt: result.retryAt || 0,
    });
    return result;
  }

  return recordObservation(product, result, 'check');
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

async function maybeNotify(product, previousPrice, price, reading = {}) {
  // A guessed reading can legitimately enter history — it passed the plausibility
  // gate — but it must never wake the user. If the drop is real, the next check
  // from a structured rung confirms it and the alert fires then. One cycle late
  // and correct beats immediate and wrong.
  if (reading.confidence === 'low' || reading.strategy === 'heuristic-blind') return;

  const settings = await getSettings();
  const stats = summarizeHistory(await getHistory(product.id));

  const verdict = evaluateAlert({
    target: product.target,
    stats,
    previousPrice,
    price,
    settings,
  });
  if (!verdict.fire) return;

  const symbol = product.currency === 'INR' ? '₹' : '';
  const fmt = (n) => `${symbol}${Number(n).toLocaleString('en-IN')}`;

  chrome.notifications.create(`ocular:${product.id}:${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: verdict.label,
    message: `${product.title.slice(0, 70)}\n${fmt(previousPrice)} → ${fmt(price)}`,
    contextMessage: product.site,
    priority: verdict.kind === 'target' ? 2 : 1,
  });
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const id = notificationId.split(':')[1];
  const product = await getProduct(id);
  if (product) chrome.tabs.create({ url: product.url || product.canonicalUrl });
  chrome.notifications.clear(notificationId);
});

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

let sweeping = false;

async function sweep() {
  if (sweeping) return; // an alarm can fire while a slow sweep is still running
  sweeping = true;

  try {
    const settings = await getSettings();
    const products = await listProducts();
    const now = Date.now();
    const dueBefore = now - settings.checkIntervalMinutes * 60 * 1000;

    const due = products
      .filter((product) => product.status !== 'paused')
      .filter((product) => !product.retryAt || product.retryAt <= now)
      .filter((product) => !product.lastCheckedAt || product.lastCheckedAt <= dueBefore)
      .slice(0, settings.maxChecksPerSweep);

    for (const product of due) {
      try {
        await checkAndRecord(product.id);
      } catch (error) {
        console.warn('Ocular: check failed', product.id, error);
      }
      // Randomised spacing so the traffic pattern doesn't look scripted.
      await sleep(MIN_REQUEST_GAP_MS + Math.random() * (MAX_REQUEST_GAP_MS - MIN_REQUEST_GAP_MS));
    }

    await refreshBadge();
  } finally {
    sweeping = false;
  }
}

async function refreshBadge() {
  const products = await listProducts();
  const errors = products.filter((product) => product.status === 'error').length;
  const active = products.filter((product) => product.status === 'active').length;

  await chrome.action.setBadgeText({ text: errors ? '!' : active ? String(active) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: errors ? '#c0392b' : '#1f6feb' });
}

async function maybeAutoBackup() {
  const settings = await getSettings();
  if (!settings.autoBackup) return;

  const meta = await getMeta();
  const dueAfter = (meta.lastBackupAt || 0) + settings.backupIntervalDays * 24 * 60 * 60 * 1000;
  if (Date.now() < dueAfter) return;
  if ((await listProducts()).length === 0) return;

  await downloadBackup(appVersion(), { silent: true }).catch((error) =>
    console.warn('Ocular: auto-backup failed', error)
  );
}

// ---------------------------------------------------------------------------
// Message API
// ---------------------------------------------------------------------------

const handlers = {
  async ping() {
    return { ok: true, version: appVersion() };
  },

  async track({ url, observed }) {
    const canonicalUrl = canonicalizeUrl(url);
    const id = productId(canonicalUrl);
    const existing = await getProduct(id);
    if (existing) return { ok: true, product: existing, alreadyTracked: true };

    const product = await upsertProduct({
      id,
      url,
      canonicalUrl,
      site: siteLabel(url),
      title: observed?.title || 'Untitled product',
      image: observed?.image || null,
      currency: observed?.currency || 'INR',
      target: null,
      status: 'active',
      createdAt: Date.now(),
    });

    // The content script usually already read the price off the live page —
    // use that rather than immediately re-fetching.
    if (observed?.price) {
      await recordObservation(product, observed, 'page-visit');
    } else {
      await checkAndRecord(id, { manual: true });
    }

    await refreshBadge();
    return { ok: true, product: await getProduct(id), alreadyTracked: false };
  },

  async untrack({ id }) {
    await removeProduct(id);
    await refreshBadge();
    return { ok: true };
  },

  async observe({ url, observed }) {
    // Passive signal: the user opened a page we already track. Free data point,
    // and it keeps working on sites where automated checks get blocked.
    const product = await getProduct(productId(canonicalizeUrl(url)));
    if (!product || !observed?.price) return { ok: true, ignored: true };
    return recordObservation(product, observed, 'page-visit');
  },

  async isTracked({ url }) {
    const product = await getProduct(productId(canonicalizeUrl(url)));
    return { ok: true, tracked: Boolean(product), product };
  },

  /**
   * Everything the in-page panel needs, including the number that actually
   * answers "is this working?" — how many readings came from an automated check
   * rather than the user happening to visit the page.
   */
  async status({ url }) {
    const product = await getProduct(productId(canonicalizeUrl(url)));
    if (!product) return { ok: true, tracked: false };

    const history = await getHistory(product.id);
    return {
      ok: true,
      tracked: true,
      version: appVersion(),
      product,
      stats: summarizeHistory(history),
      autoChecks: history.filter((point) => point.source === 'check').length,
      visitChecks: history.filter((point) => point.source === 'page-visit').length,
    };
  },

  async list() {
    const products = await listProducts();
    const enriched = await Promise.all(
      products.map(async (product) => {
        const history = await getHistory(product.id);
        return {
          ...product,
          stats: summarizeHistory(history),
          sparkline: history.slice(-40).map((point) => point.price),
        };
      })
    );
    return { ok: true, products: enriched };
  },

  async check({ id }) {
    const result = await checkAndRecord(id, { manual: true });
    await refreshBadge();
    return result;
  },

  async checkAll() {
    await sweep();
    return { ok: true };
  },

  async setTarget({ id, target }) {
    const product = await getProduct(id);
    if (!product) return { ok: false, error: 'Unknown product' };
    await upsertProduct({ ...product, target });
    return { ok: true };
  },

  async setStatus({ id, status }) {
    const product = await getProduct(id);
    if (!product) return { ok: false, error: 'Unknown product' };
    await upsertProduct({ ...product, status, lastError: null, retryAt: 0 });
    await refreshBadge();
    return { ok: true };
  },

  async exportBackup() {
    const result = await downloadBackup(appVersion(), { silent: false });
    return { ok: true, ...result };
  },

  async diagnostics() {
    const products = await listProducts();
    const hosts = await listHostStates();
    const meta = await getMeta();
    return {
      ok: true,
      version: appVersion(),
      products: products.length,
      errors: products.filter((product) => product.status === 'error').length,
      hosts,
      lastBackupAt: meta.lastBackupAt || 0,
    };
  },

  async syncNow() {
    return syncIfEnabled();
  },

  async settingsChanged() {
    await scheduleAlarms();
    await refreshBadge();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Offscreen traffic is not ours to answer.
  if (message?.target === OFFSCREEN_TARGET) return false;

  const handler = handlers[message?.type];
  if (!handler) return false;

  handler(message)
    .then(sendResponse)
    .catch((error) => {
      console.error('Ocular:', message.type, error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    });

  return true; // keep the channel open for the async reply
});
