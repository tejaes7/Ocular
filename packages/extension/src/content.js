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

const BUTTON_ID = 'ocular-monitor-button';
const PANEL_ID = 'ocular-panel';

let lastUrl = location.href;
let evaluateTimer = null;

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

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.className = `ocular-btn${tracked ? ' ocular-btn--tracked' : ''}`;
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = `
    <span class="ocular-btn__eye" aria-hidden="true"></span>
    <span class="ocular-btn__label"></span>
  `;
  button.querySelector('.ocular-btn__label').textContent = tracked ? 'Watching' : 'Monitor price';

  button.addEventListener('click', async () => {
    if (button.dataset.busy) return;

    if (tracked) {
      await togglePanel();
      return;
    }

    button.dataset.busy = '1';
    const label = button.querySelector('.ocular-btn__label');
    label.textContent = 'Adding…';

    const observed = scrape();
    const response = await send({
      type: 'track',
      url: location.href,
      observed: observed.ok ? observed : null,
    });

    delete button.dataset.busy;

    if (response.ok && response.product) {
      renderButton({ tracked: true });
      flash(`Watching at ${money(response.product.lastPrice, response.product.currency)}`);
    } else {
      label.textContent = 'Try again';
      flash(response.stale ? 'Ocular was updated — refresh this page.' : 'Could not add this product.');
    }
  });

  document.body.appendChild(button);
}

function flash(text) {
  document.querySelector('.ocular-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'ocular-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = text;
  document.body.appendChild(toast);

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
    renderPanelError(panel, 'This product is no longer being watched.');
    return;
  }

  renderPanel(panel, state);
}

function panelShell({ body, actions = '', foot = '' }) {
  return `
    <div class="ocular-panel__head">
      <span class="ocular-panel__brand">Ocular</span>
      <button class="ocular-panel__x" data-act="close" aria-label="Close">&times;</button>
    </div>
    <div class="ocular-panel__body">${body}</div>
    ${actions ? `<div class="ocular-panel__actions">${actions}</div>` : ''}
    ${foot ? `<div class="ocular-panel__foot">${foot}</div>` : ''}
  `;
}

function renderPanelError(panel, text) {
  panel.innerHTML = panelShell({
    body: `<div class="ocular-panel__msg ocular-panel__msg--bad">${escapeHtml(text)}</div>`,
    actions: '<button data-act="reload">Refresh page</button>',
  });

  panel.onclick = (event) => {
    const action = event.target.closest('button[data-act]')?.dataset.act;
    if (action === 'close') closePanel();
    if (action === 'reload') location.reload();
  };
}

function renderPanel(panel, state) {
  const { product, stats, autoChecks, visitChecks, version } = state;
  const currency = product.currency;

  const rows = [
    ['Current', money(product.lastPrice, currency), true],
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
      ${rows
        .map(
          ([label, value, hero]) =>
            `<div class="ocular-panel__row${hero ? ' ocular-panel__row--hero' : ''}">
               <span>${label}</span><b>${escapeHtml(value)}</b>
             </div>`
        )
        .join('')}
      ${health}
    `,
    actions: `
      <button data-act="check">Check now</button>
      <button data-act="stop">Stop watching</button>
    `,
    foot: `v${escapeHtml(version)}`,
  });

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

async function evaluatePage() {
  removeButton();
  closePanel();
  if (!looksLikeProductPage(location.href)) return;

  const observed = scrape();
  if (!observed.ok) return;

  const status = await send({ type: 'isTracked', url: location.href });
  if (!status.ok) return; // extension reloaded; stay quiet rather than lie

  if (status.tracked) {
    await send({ type: 'observe', url: location.href, observed });
  }

  renderButton({ tracked: Boolean(status.tracked) });
}

/** Retailers render prices late and navigate client-side. Give the page a beat. */
function scheduleEvaluate(delay = 1200) {
  clearTimeout(evaluateTimer);
  evaluateTimer = setTimeout(() => evaluatePage().catch(console.warn), delay);
}

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scheduleEvaluate(1500);
  }
}).observe(document, { subtree: true, childList: true });

// Answers the background worker during a hidden-tab check.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ocular:scrape') return false;
  sendResponse(scrape());
  return true;
});

scheduleEvaluate(800);
