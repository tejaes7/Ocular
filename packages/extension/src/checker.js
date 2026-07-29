/**
 * The checking ladder.
 *
 * Retailers block datacenter IPs, and increasingly they fingerprint plain
 * `fetch` too. So we escalate, cheapest first, and remember which rung worked
 * for each hostname so the next check starts there instead of re-paying for the
 * discovery.
 *
 *   1. fetch      invisible, fast, free — works on well-behaved retailers
 *   2. hidden tab a real background tab with a real renderer and real cookies.
 *                 Very hard to block, because it isn't an imitation of a browser
 *                 page view; it is one. Costs memory and blinks in the tab strip.
 *   3. give up    mark the host blocked, back off, keep passive logging alive
 *
 * Everything here is async and cancellable, and a tab is *always* closed in a
 * `finally` — a leaked background tab is the worst failure mode available to us.
 */

import { looksBlocked } from '@ocular/shared/htmlscan';
import { getHostState, saveHostState } from './lib/store.js';

const OFFSCREEN_TARGET = 'ocular-offscreen';

const TAB_LOAD_TIMEOUT_MS = 25000;
const TAB_POLL_INTERVAL_MS = 900;

const BACKOFF_STEPS_MS = [
  60 * 60 * 1000,        // 1 hour
  3 * 60 * 60 * 1000,    // 3 hours
  12 * 60 * 60 * 1000,   // 12 hours
  24 * 60 * 60 * 1000,   // 1 day
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Offscreen document — the service worker's only route to a DOMParser
// ---------------------------------------------------------------------------

let creatingOffscreen = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Parse fetched product pages to read their current price.',
    })
    .catch((error) => {
      // Two callers can race; losing the race is not an error.
      if (!String(error).includes('Only a single offscreen')) throw error;
    })
    .finally(() => {
      creatingOffscreen = null;
    });

  return creatingOffscreen;
}

async function parseHtml(html, url, learnedSelector) {
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    type: 'parse',
    html,
    url,
    learnedSelector,
  });
  if (!result) throw Object.assign(new Error('Offscreen parser did not respond'), { code: 'parse-error' });
  return result;
}

// ---------------------------------------------------------------------------
// Rung 1 — fetch
// ---------------------------------------------------------------------------

async function checkViaFetch(product) {
  const response = await fetch(product.url || product.canonicalUrl, {
    // The user's own cookies are the entire reason this looks legitimate.
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      code: response.status === 404 || response.status === 410 ? 'gone' : 'blocked',
    });
  }

  const html = await response.text();
  if (looksBlocked(html)) {
    throw Object.assign(new Error('Anti-bot interstitial'), { code: 'blocked' });
  }

  const parsed = await parseHtml(html, product.canonicalUrl, product.learnedSelector);
  if (!parsed.ok) throw Object.assign(new Error('No price found'), { code: 'no-price' });
  return parsed;
}

// ---------------------------------------------------------------------------
// Rung 2 — hidden tab
// ---------------------------------------------------------------------------

/** Only one background tab may exist at a time, across all callers. */
let tabQueue = Promise.resolve();

function serialise(task) {
  const run = tabQueue.then(task, task);
  // Keep the chain alive even when a task rejects.
  tabQueue = run.catch(() => {});
  return run;
}

async function waitForTabComplete(tabId, deadline) {
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw Object.assign(new Error('Tab closed'), { code: 'tab-timeout' });
    if (tab.status === 'complete') return;
    await sleep(400);
  }
  throw Object.assign(new Error('Tab load timed out'), { code: 'tab-timeout' });
}

/**
 * Ask the content script what it can see. Retailers paint prices well after
 * `complete`, so poll rather than reading once.
 */
async function pollForPrice(tabId, url, deadline) {
  let injected = false;

  while (Date.now() < deadline) {
    const result = await chrome.tabs
      .sendMessage(tabId, { type: 'ocular:scrape' })
      .catch(() => null);

    if (result?.ok) return result;

    // No content script on this host (a user-added site). Inject once.
    if (result === null && !injected) {
      injected = true;
      await chrome.scripting
        .executeScript({ target: { tabId }, files: ['content.js'] })
        .catch(() => {});
    }

    await sleep(TAB_POLL_INTERVAL_MS);
  }

  throw Object.assign(new Error('Price never rendered'), { code: 'tab-timeout' });
}

async function checkViaTab(product) {
  return serialise(async () => {
    const deadline = Date.now() + TAB_LOAD_TIMEOUT_MS;
    const url = product.url || product.canonicalUrl;

    // Open in the most recently used normal window so we don't spawn a new one.
    const target = await chrome.windows
      .getLastFocused({ windowTypes: ['normal'] })
      .catch(() => null);

    const tab = await chrome.tabs.create({
      url,
      active: false,
      windowId: target?.id,
    });

    try {
      await waitForTabComplete(tab.id, deadline);
      return await pollForPrice(tab.id, url, deadline);
    } finally {
      // A leaked tab is far worse than a failed check.
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

function hostnameOf(product) {
  try {
    return new URL(product.canonicalUrl).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * @param {object} product
 * @param {object} settings
 * @param {{ manual?: boolean }} options  manual checks bypass idle and backoff rules
 * @returns {Promise<{ok: boolean, ...}>}
 */
export async function runCheck(product, settings, { manual = false } = {}) {
  const host = hostnameOf(product);
  const state = await getHostState(host);
  const now = Date.now();

  if (!manual && state.blockedUntil && state.blockedUntil > now) {
    return { ok: false, code: 'blocked', deferred: true, retryAt: state.blockedUntil };
  }

  const tabAllowed = settings.tabChecks !== false && (manual || (await tabChecksPermittedNow(settings)));

  // Start on the rung that worked last time.
  const ladder =
    state.strategy === 'tab' && tabAllowed
      ? [['tab', checkViaTab]]
      : [['fetch', checkViaFetch], ...(tabAllowed ? [['tab', checkViaTab]] : [])];

  let lastError = { code: 'no-strategy' };

  for (const [name, strategy] of ladder) {
    try {
      const result = await strategy(product);
      await saveHostState(host, { strategy: name, failures: 0, blockedUntil: 0, lastOkAt: Date.now() });
      return { ok: true, via: name, ...result };
    } catch (error) {
      lastError = { code: error.code || 'fetch-failed', message: String(error.message || error) };
      // A dead page won't come back by trying harder.
      if (lastError.code === 'gone') break;
    }
  }

  const failures = (state.failures || 0) + 1;
  const backoff = BACKOFF_STEPS_MS[Math.min(failures - 1, BACKOFF_STEPS_MS.length - 1)];
  await saveHostState(host, {
    strategy: state.strategy,
    failures,
    blockedUntil: lastError.code === 'blocked' ? Date.now() + backoff : 0,
  });

  return { ok: false, ...lastError };
}

/**
 * Opening background tabs while someone is mid-task is rude — it flickers in the
 * tab strip and competes for CPU. Automatic checks wait for a quiet moment;
 * manual ones never reach here.
 */
async function tabChecksPermittedNow(settings) {
  if (settings.tabChecksOnlyWhenIdle === false) return true;
  const state = await new Promise((resolve) => chrome.idle.queryState(60, resolve));
  return state !== 'active';
}

export const __testing = { BACKOFF_STEPS_MS };
