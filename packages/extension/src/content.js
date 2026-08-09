/**
 * Content script — the in-page button and status panel.
 *
 * Two jobs:
 *   1. Passive logging. Every time the user opens a product page we already
 *      track, record the price we can see. It costs no network request and it
 *      keeps working on sites where automated checks get blocked.
 *   2. The visible surface: a "Monitor price" button, and once tracked, a panel
 *      showing what Ocular actually knows.
 *
 * This file is bundled (see build.mjs). It previously used
 * `import(chrome.runtime.getURL(...))`, which is evaluated against the *page's*
 * CSP on some Chrome versions — and every retailer we target ships a strict CSP.
 */

import { extractProduct } from '@ocular/shared/extract';
import { escapeHtml, money, relativeTime } from '@ocular/shared/format';
import { looksLikeProductPage } from '@ocular/shared/sites';
import { makeDraggable, placeNear } from './lib/overlay.js';

const BUTTON_ID = 'ocular-monitor-button';
const PANEL_ID = 'ocular-panel';

/** How long to keep waiting for a client-rendered page to paint its price. */
const EXTRACT_TIMEOUT_MS = 15000;

/** Quiet period after a burst of DOM mutations before we try scraping again. */
const DOM_SETTLE_MS = 250;

let lastUrl = location.href;
let evaluateTimer = null;

// Mark document root so web pages know the extension is installed
try {
  document.documentElement.dataset.ocularInstalled = 'true';
} catch (e) {}

// Listen for custom track requests from web pages
window.addEventListener('OCULAR_TRACK_LINK', (event) => {
  const url = event?.detail?.url;
  if (url) {
    chrome.runtime.sendMessage({ action: 'UPSERT', url }, (res) => {
      window.dispatchEvent(new CustomEvent('OCULAR_TRACK_RESPONSE', { detail: res }));
    });
  }
});

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/**
 * Never swallow failures.
 *
 * The old version returned `null` on any error, and the panel read `null` as
 * "not tracked" and silently removed itself — so a stale content script after an
 * extension reload looked exactly like a dead button. Now every failure comes
 * back as a value the UI can render.
 */
async function send(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (response === undefined) {
      return { ok: false, error: 'The background worker did not respond.', stale: true };
    }
    return response;
  } catch (error) {
    const text = String(error?.message || error);
    return {
      ok: false,
      error: text,
      // Thrown when the extension has been reloaded/updated but this page still
      // runs the old injected script. Only a page refresh fixes it.
      stale: /context invalidated|Receiving end does not exist|message port closed/i.test(text),
    };
  }
}

function scrape() {
  try {
    return extractProduct(document, location.href);
  } catch (error) {
    console.warn('Ocular: extraction failed', error);
    return { ok: false, reason: 'extract-error' };
  }
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

function removeButton() {
  document.getElementById(BUTTON_ID)?.remove();
}

function renderButton({ tracked }) {
  removeButton();

  // `document_idle` guarantees a body, but the checker also injects this file
  // into background tabs via chrome.scripting, where timing is less certain.
  if (!document.body) return;

  const name = tracked ? 'Ocular — watching this product' : 'Ocular — track this price';

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.className = `ocular-btn${tracked ? ' ocular-btn--tracked' : ''}`;
  button.setAttribute('aria-haspopup', 'dialog');
  // A circular badge carries no text, so the accessible name and the tooltip are
  // the only things naming it. Both, not one: the tooltip is for a sighted user
  // hovering an unfamiliar dot, aria-label is for everyone else.
  button.setAttribute('aria-label', name);
  button.title = name;
  // The brand mark, not the CSS-drawn eye it used to be. Loaded from the
  // extension's own resources, which is why it is listed under
  // web_accessible_resources in the manifest.
  //
  // Two ways this can fail, and both used to leave an empty circle on the page:
  // getURL() throws once the extension has been reloaded and this script is
  // orphaned, and a retailer with a strict img-src CSP can refuse to load a
  // chrome-extension:// URL at all. Either way the badge falls back to the
  // CSS-drawn eye rather than rendering as nothing.
  const eye = () => {
    const span = document.createElement('span');
    span.className = 'ocular-btn__eye';
    span.setAttribute('aria-hidden', 'true');
    return span;
  };

  let markUrl = null;
  try {
    markUrl = chrome.runtime.getURL('icons/ocular-mark.png');
  } catch {
    markUrl = null;
  }

  if (markUrl) {
    const mark = document.createElement('img');
    mark.className = 'ocular-btn__mark';
    mark.src = markUrl;
    mark.alt = '';
    mark.setAttribute('aria-hidden', 'true');
    mark.draggable = false;
    mark.addEventListener('error', () => mark.replaceWith(eye()), { once: true });
    button.replaceChildren(mark);
  } else {
    button.replaceChildren(eye());
  }

  // The badge is only an entry point now — every action lives in the panel.
  // It previously tracked the product outright when untracked, which meant the
  // one control did two different things depending on state, and gave a first-
  // time visitor no way to find out what it was before committing to it.
  button.addEventListener('click', () => togglePanel());

  document.body.appendChild(button);

  // Drag-to-move. The overlay module suppresses the click that follows a real
  // drag, so the handler above only ever sees an intentional press.
  makeDraggable(button, {
    onMove() {
      const panel = document.getElementById(PANEL_ID);
      if (panel) placeNear(panel, button);
    },
  });
}

/**
 * Flip the badge between "not tracked" and "watching" without rebuilding it.
 *
 * Re-rendering would drop the element the drag module is managing, so the badge
 * would jump back to the corner every time its state resolved.
 */
function setButtonState({ tracked }) {
  const button = document.getElementById(BUTTON_ID);
  if (!button) return;

  const name = tracked ? 'Ocular — watching this product' : 'Ocular — track this price';
  button.classList.toggle('ocular-btn--tracked', tracked);
  button.setAttribute('aria-label', name);
  button.title = name;
}

function flash(text) {
  document.querySelector('.ocular-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'ocular-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = text;
  document.body.appendChild(toast);

  // The stylesheet parks the toast in the bottom-right corner, one badge-height
  // above where the badge used to be pinned. Now that the badge can be dragged
  // anywhere, that corner is often nowhere near it — so anchor to the badge like
  // the panel does, and only fall back to the corner if there isn't one.
  const anchor = document.getElementById(BUTTON_ID);
  if (anchor) placeNear(toast, anchor);

  setTimeout(() => toast.classList.add('ocular-toast--out'), 2600);
  setTimeout(() => toast.remove(), 3200);
}

// ---------------------------------------------------------------------------
// Status panel
// ---------------------------------------------------------------------------

function closePanel() {
  document.getElementById(PANEL_ID)?.remove();
  document.removeEventListener('keydown', onPanelKeydown);
}

function onPanelKeydown(event) {
  if (event.key === 'Escape') closePanel();
}

/**
 * Keep the panel attached to the button.
 *
 * Called after every render because the panel's height changes with its content
 * — an error message is far shorter than the full stats view, and a panel
 * anchored above the button would otherwise drift as it resizes.
 */
function anchorPanel(panel) {
  const button = document.getElementById(BUTTON_ID);
  if (button) placeNear(panel, button);
}

async function togglePanel() {
  if (document.getElementById(PANEL_ID)) {
    closePanel();
    return;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'ocular-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ocular price watch status');
  panel.innerHTML = '<div class="ocular-panel__msg">Loading…</div>';
  document.body.appendChild(panel);
  anchorPanel(panel);
  document.addEventListener('keydown', onPanelKeydown);

  const state = await send({ type: 'status', url: location.href });

  if (!state.ok) {
    renderPanelError(
      panel,
      state.stale
        ? 'Ocular was updated. Refresh this page to reconnect.'
        : `Could not reach Ocular: ${state.error}`
    );
    return;
  }

  if (!state.tracked) {
    // Not an error — this is the ordinary first visit to a product page.
    renderIntroPanel(panel);
    return;
  }

  renderPanel(panel, state);
}

/**
 * `branded` swaps the plain header for the navy band carrying the mark. Used on
 * the pre-track panel, where the visitor may not yet know whose control this is;
 * the status panel keeps the quieter header so the numbers stay the loudest
 * thing on it.
 */
function panelShell({ body, actions = '', foot = '' }) {
  let mark = '';
  try {
    mark = `<img class="ocular-panel__mark" src="${chrome.runtime.getURL('icons/ocular-mark.png')}" alt="Ocular" aria-hidden="true">`;
  } catch {
    mark = '';
  }

  return `
    <div class="ocular-panel__ambient" aria-hidden="true"></div>
    <div class="ocular-panel__head">
      <div class="ocular-panel__brand-wrap">
        ${mark}
        <span class="ocular-panel__brand">Ocular</span>
      </div>
      <button class="ocular-panel__x" data-act="close" aria-label="Close">&times;</button>
    </div>
    <div class="ocular-panel__body">${body}</div>
    ${actions ? `<div class="ocular-panel__actions">${actions}</div>` : ''}
    ${foot ? `<div class="ocular-panel__foot">${foot}</div>` : ''}
  `;
}

/** Track the current page, then swap the panel over to the live status view. */
async function trackFromPanel(panel, trigger) {
  if (trigger.dataset.busy) return;
  trigger.dataset.busy = '1';
  trigger.textContent = 'Adding…';

  const observed = scrape();
  const response = await send({
    type: 'track',
    url: location.href,
    observed: observed.ok ? observed : null,
  });

  delete trigger.dataset.busy;

  if (!response.ok || !response.product) {
    trigger.textContent = 'Try again';
    flash(response.stale ? 'Ocular was updated — refresh this page.' : 'Could not add this product.');
    return;
  }

  setButtonState({ tracked: true });

  const state = await send({ type: 'status', url: location.href });
  if (state.ok && state.tracked) {
    renderPanel(panel, state);
    return;
  }

  closePanel();
  flash(`Watching at ${money(response.product.lastPrice, response.product.currency)}`);
}

/**
 * What Ocular does, shown before anything is tracked.
 */
function renderIntroPanel(panel) {
  const observed = scrape();
  const priceNow =
    observed.ok && Number.isFinite(observed.price)
      ? money(observed.price, observed.currency)
      : 'Not readable here';
  const isOos = observed.ok && observed.inStock === false;

  panel.innerHTML = panelShell({
    body: `
      <div class="ocular-panel__lede">Not watched</div>
      ${isOos ? '<div class="ocular-panel__msg ocular-panel__msg--bad" style="margin-bottom: 12px;">Currently unavailable (Out of stock)</div>' : ''}
      <div class="ocular-panel__cards-container">
        <div class="ocular-panel__row ocular-panel__row--hero">
          <span>Price now</span>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
            <b>${escapeHtml(priceNow)}</b>
            ${isOos ? '<span class="ocular-badge--oos">Out of stock</span>' : ''}
          </div>
        </div>
        <div class="ocular-panel__row">
          <span>Readings</span><b>0</b>
        </div>
        <div class="ocular-panel__row">
          <span>Checks</span><b class="ocular-panel__ledger-note">On visit, then hourly</b>
        </div>
        <div class="ocular-panel__row">
          <span>Alerts</span><b class="ocular-panel__ledger-note">Against the 90-day median</b>
        </div>
      </div>
    `,
    actions: '<button data-act="track" class="gemini-btn primary">Watch this price</button>',
  });
  anchorPanel(panel);

  panel.onclick = (event) => {
    const trigger = event.target.closest('button[data-act]');
    if (!trigger) return;
    if (trigger.dataset.act === 'close') closePanel();
    if (trigger.dataset.act === 'track') trackFromPanel(panel, trigger);
  };
}

function renderPanelError(panel, text) {
  panel.innerHTML = panelShell({
    body: `<div class="ocular-panel__msg ocular-panel__msg--bad">${escapeHtml(text)}</div>`,
    actions: '<button data-act="reload" class="ocular-panel__btn primary">Refresh page</button>',
  });
  anchorPanel(panel);

  panel.onclick = (event) => {
    const action = event.target.closest('button[data-act]')?.dataset.act;
    if (action === 'close') closePanel();
    if (action === 'reload') location.reload();
  };
}

function renderPanel(panel, state) {
  const { product, stats, autoChecks, visitChecks, version } = state;
  const currency = product.currency;
  const isOos = product.lastInStock === false;

  const rows = [
    ['Current', money(product.lastPrice, currency), true, isOos],
    stats && ['Lowest seen', money(stats.min, currency)],
    stats && ['Usual price', money(stats.median90, currency)],
    ['Last checked', relativeTime(product.lastCheckedAt)],
    ['Readings', String(stats?.points ?? 0)],
  ].filter(Boolean);

  // The honest health check: readings from an automated check vs. readings that
  // only exist because the user happened to open the page.
  let health;
  if (product.lastError) {
    health = `<div class="ocular-panel__msg ocular-panel__msg--bad">
        Last automatic check failed (${escapeHtml(product.lastError)}). Ocular will retry with a
        different method.
      </div>`;
  } else if (autoChecks > 0) {
    health = `<div class="ocular-panel__msg ocular-panel__msg--good">
        Automatic checks are working — ${autoChecks} so far.
      </div>`;
  } else {
    health = `<div class="ocular-panel__msg">
        No automatic check yet. ${visitChecks} reading${visitChecks === 1 ? '' : 's'} came from you
        visiting this page. Press “Check now” to test it.
      </div>`;
  }

  panel.innerHTML = panelShell({
    body: `
      <p class="ocular-panel__title">${escapeHtml(product.title)}</p>
      ${isOos ? '<div class="ocular-panel__msg ocular-panel__msg--bad" style="margin-bottom: 12px;">Currently unavailable (Out of stock)</div>' : ''}
      <div class="ocular-panel__cards-container">
        ${rows
          .map(
            ([label, value, hero, oos]) =>
              `<div class="ocular-panel__row${hero ? ' ocular-panel__row--hero' : ''}">
                 <span>${label}</span>
                 <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                   <b>${escapeHtml(value)}</b>
                   ${oos ? '<span class="ocular-badge--oos">Out of stock</span>' : ''}
                 </div>
               </div>`
          )
          .join('')}
      </div>
      ${health}
    `,
    actions: `
      <button data-act="check" class="ocular-panel__btn primary">Check now</button>
      <button data-act="stop" class="ocular-panel__btn secondary">Stop watching</button>
    `,
    foot: `v${escapeHtml(version)}`,
  });
  anchorPanel(panel);

  panel.onclick = async (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const action = button.dataset.act;

    if (action === 'close') return closePanel();

    if (action === 'stop') {
      await send({ type: 'untrack', id: product.id });
      closePanel();
      scheduleEvaluate(0);
      return;
    }

    if (action === 'check') {
      button.disabled = true;
      button.textContent = 'Checking…';

      const result = await send({ type: 'check', id: product.id });
      const fresh = await send({ type: 'status', url: location.href });

      if (fresh.ok && fresh.tracked) {
        renderPanel(panel, fresh);
        if (!result.ok) flash(`Check failed: ${result.code || result.error}`);
      } else {
        renderPanelError(panel, 'Lost contact with Ocular. Refresh the page.');
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Page lifecycle
// ---------------------------------------------------------------------------

/**
 * Wait until the page actually contains a price.
 *
 * React/Vue/Angular storefronts ship an empty shell and paint the price after a
 * client-side fetch, so the first scrape routinely fails on a page that reads
 * perfectly two seconds later. This used to take that first failure as final and
 * return — which is the whole reason the button never appeared on those sites.
 * The observer at the bottom of this file only re-runs on a *URL* change, and a
 * price arriving is not a URL change, so nothing ever tried again.
 *
 * Driven by mutations rather than a fixed poll: it settles the moment the price
 * node lands, and costs nothing once the page goes quiet. `characterData` is
 * included because a framework re-rendering a price often replaces the text of
 * an existing node rather than the node itself.
 *
 * Nothing here blocks page load — it is all observer callbacks and timers.
 */
function waitForExtractable(url) {
  const first = scrape();
  if (first.ok) return Promise.resolve(first);

  return new Promise((resolve) => {
    let settleTimer = null;
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(settleTimer);
      clearTimeout(deadline);
      observer.disconnect();
      resolve(result);
    };

    const attempt = () => {
      // A client-side navigation mid-wait makes anything we scrape belong to a
      // different product. Bail and let the URL watcher start a fresh pass.
      if (location.href !== url) return finish({ ok: false, reason: 'navigated' });

      const result = scrape();
      if (result.ok) finish(result);
    };

    const observer = new MutationObserver(() => {
      // Retailer pages mutate constantly — carousels, lazy images, ad slots — so
      // debounce and scrape once per burst instead of once per node.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(attempt, DOM_SETTLE_MS);
    });

    const deadline = setTimeout(() => finish({ ok: false, reason: 'extract-timeout' }), EXTRACT_TIMEOUT_MS);

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

/**
 * Cancels a slow in-flight evaluation when a newer one starts, so a client-side
 * navigation during the 15s extract window can't render a button for the product
 * the user just navigated away from.
 */
let evaluateToken = 0;

async function evaluatePage() {
  const token = ++evaluateToken;
  const url = location.href;

  removeButton();
  closePanel();
  if (!looksLikeProductPage(url)) return;

  // Show the badge the moment we know this is a product page.
  //
  // It used to render only after waitForExtractable() resolved, which is a wait
  // of up to EXTRACT_TIMEOUT_MS on a client-rendered page — so on a slow store
  // the badge appeared seconds after the page had finished loading, long after
  // anyone had stopped looking for it. Rendering first and resolving state after
  // means it is there immediately; the only thing that arrives late is the
  // green "watching" dot.
  renderButton({ tracked: false });

  const observed = await waitForExtractable(url);
  if (token !== evaluateToken || location.href !== url) return; // superseded

  // Nothing readable on the page, so there is nothing to offer. Withdrawing the
  // badge keeps the original promise: never show a control that cannot work.
  if (!observed.ok) return removeButton();

  const status = await send({ type: 'isTracked', url });
  if (token !== evaluateToken) return;
  if (!status.ok) return removeButton(); // extension reloaded; don't lie

  if (status.tracked) {
    await send({ type: 'observe', url, observed });
    if (token !== evaluateToken) return;
  }

  // Update in place rather than re-rendering: a second renderButton() would
  // replace the element and throw away wherever the user had dragged it.
  setButtonState({ tracked: Boolean(status.tracked) });
}

/**
 * Retailers render prices late and navigate client-side.
 *
 * The delay is asymmetric on purpose. On a fresh document load there is no stale
 * content to misread, so the first attempt goes immediately and `waitForExtractable`
 * absorbs any lateness. After a client-side navigation the old product's price is
 * still sitting in the DOM, so we wait — scraping too early there reads the *previous*
 * product, and a wrong price is worse than a late one.
 */
function scheduleEvaluate(delay = 1200) {
  clearTimeout(evaluateTimer);
  evaluateTimer = setTimeout(() => evaluatePage().catch(console.warn), delay);
}

/**
 * A second copy of this script can land in the same frame: the manifest injects
 * it on matched hosts, and checker.js injects it again for user-added sites.
 * Both copies share one isolated world, so this flag stops the second from
 * registering a rival `ocular:scrape` listener and racing the first.
 */
if (!window.__ocularContentLoaded) {
  window.__ocularContentLoaded = true;

  const checkUrlChange = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleEvaluate(1500);
    }
  };

  window.addEventListener('popstate', checkUrlChange);
  window.addEventListener('hashchange', checkUrlChange);

  let urlCheckTimer = null;
  new MutationObserver(() => {
    if (location.href !== lastUrl && !urlCheckTimer) {
      urlCheckTimer = setTimeout(() => {
        urlCheckTimer = null;
        checkUrlChange();
      }, 300);
    }
  }).observe(document.head || document.documentElement, { subtree: true, childList: true });

  // Answers the background worker during a hidden-tab check.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'ocular:scrape') return false;
    sendResponse(scrape());
    return true;
  });

  scheduleEvaluate(0);
}
