import { escapeHtml, explainError, money, percentChange, relativeTime } from '@ocular/shared/format';
import { looksLikeProductPage } from '@ocular/shared/sites';
import { eyeMark, icons } from './ui/icons.js';
import { extensionsUrl } from './lib/browser.js';

const listEl = document.getElementById('list');
const bannerEl = document.getElementById('current');
const summaryEl = document.getElementById('summary');

const send = async (message) => {
  try {
    return (await chrome.runtime.sendMessage(message)) ?? {
      ok: false,
      error: 'No response from the background worker.',
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
};

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

/**
 * Price history with a dotted baseline at the 90-day median.
 *
 * The baseline is the point of the chart: it turns a decorative squiggle into a
 * readable claim — "this is currently below/above what it usually costs" — which
 * is the one question a price watcher exists to answer.
 */
function chart(values, median, width = 320, height = 40) {
  if (!values || values.length < 2) {
    return '<div class="row__meta" style="margin:8px 0 6px">Not enough history yet</div>';
  }

  const pad = 5;
  const lo = Math.min(...values, median ?? Infinity);
  const hi = Math.max(...values, median ?? -Infinity);
  const span = hi - lo || 1;

  const y = (value) => height - pad - ((value - lo) / span) * (height - pad * 2);
  const x = (i) => (i / (values.length - 1)) * width;

  const points = values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`);
  const last = values[values.length - 1];
  const fell = last <= values[0];
  const stroke = fell ? 'var(--down)' : 'var(--up)';

  const lowIndex = values.indexOf(Math.min(...values));

  const baseline =
    median != null && Number.isFinite(median)
      ? `<line x1="0" y1="${y(median).toFixed(1)}" x2="${width}" y2="${y(median).toFixed(1)}"
               stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="2 3" opacity="0.65"
               vector-effect="non-scaling-stroke" />`
      : '';

  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
         aria-label="Price history: ${values.length} readings, low ${lo}, high ${hi}">
      <polygon points="0,${height} ${points.join(' ')} ${width},${height}" fill="${stroke}" opacity="0.07" />
      ${baseline}
      <polyline points="${points.join(' ')}" fill="none" stroke="${stroke}" stroke-width="1.6"
                stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <circle cx="${x(lowIndex).toFixed(1)}" cy="${y(values[lowIndex]).toFixed(1)}" r="2.3"
              fill="var(--bg)" stroke="var(--down)" stroke-width="1.5" />
      <circle cx="${width}" cy="${y(last).toFixed(1)}" r="2.6" fill="${stroke}" />
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function deltaMarkup(stats) {
  if (!stats || stats.points < 2) return '';
  const change = percentChange(stats.first, stats.current);
  if (change == null) return '';

  if (Math.abs(change) < 0.5) return '<span class="delta delta--flat">no change</span>';
  const fell = change < 0;
  // Minus sign, not a hyphen — it aligns with tabular figures.
  return `<span class="delta delta--${fell ? 'down' : 'up'}">${fell ? '−' : '+'}${Math.abs(change).toFixed(1)}%</span>`;
}

function flags(product) {
  const out = [];
  const { stats } = product;

  if (stats && stats.points > 2 && stats.current <= stats.min) {
    out.push('<span class="flag flag--down">lowest yet</span>');
  }
  if (product.lastInStock === false) {
    out.push('<span class="flag flag--up">out of stock</span>');
  }
  if (product.status === 'paused') {
    out.push('<span class="flag">paused</span>');
  }
  return out.join('');
}

function alertRow(product) {
  const target = product.target || {};
  const needsValue = target.type === 'absolute' || target.type === 'percent';

  const options = [
    ['', 'any drop'],
    ['absolute', 'below price'],
    ['percent', '% below usual'],
    ['median', 'below usual'],
  ];

  return `
    <div class="alert">
      <span class="label alert__label">Alert</span>
      <select class="field" data-role="alert-type" aria-label="Alert rule">
        ${options
          .map(
            ([value, label]) =>
              `<option value="${value}"${(target.type || '') === value ? ' selected' : ''}>${label}</option>`
          )
          .join('')}
      </select>
      <input class="field num" type="number" min="0" step="any" data-role="alert-value"
             aria-label="Alert threshold" placeholder="${target.type === 'percent' ? '%' : '0'}"
             value="${needsValue && target.value != null ? target.value : ''}" ${needsValue ? '' : 'hidden'} />
      <button class="btn btn--sm" data-act="save-alert">Set</button>
    </div>
  `;
}

function renderRow(product) {
  const { stats } = product;
  const paused = product.status === 'paused';

  return `
    <article class="row${paused ? ' row--paused' : ''}" data-id="${product.id}">
      ${
        product.image
          ? `<img class="row__thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" />`
          : '<div class="row__thumb row__thumb--empty"></div>'
      }
      <div class="row__body">
        <div class="row__head">
          <h2 class="row__title">
            <a href="${escapeHtml(product.url)}" target="_blank" rel="noreferrer">${escapeHtml(product.title)}</a>
          </h2>
          <div class="row__tools">
            <button class="iconbtn" data-act="check" title="Check now" aria-label="Check now">${icons.refresh}</button>
            <button class="iconbtn" data-act="toggle" title="${paused ? 'Resume' : 'Pause'}"
                    aria-label="${paused ? 'Resume' : 'Pause'}">${paused ? icons.play : icons.pause}</button>
            <button class="iconbtn iconbtn--danger" data-act="remove" title="Remove" aria-label="Remove">${icons.trash}</button>
          </div>
        </div>

        <div class="row__price">
          <span class="amount">${money(product.lastPrice, product.currency)}</span>
          ${deltaMarkup(stats)}
          ${flags(product)}
        </div>

        ${chart(product.sparkline, stats?.median90)}

        <div class="row__meta">
          <span>${escapeHtml(product.site)}</span>
          <span class="sep">/</span>
          <span>${relativeTime(product.lastCheckedAt)}</span>
          ${stats ? `<span class="sep">/</span><span>low ${money(stats.min, product.currency)}</span>` : ''}
          ${stats ? `<span class="sep">/</span><span>usual ${money(stats.median90, product.currency)}</span>` : ''}
        </div>

        ${product.lastError ? `<div class="row__error">${escapeHtml(explainError(product.lastError))}</div>` : ''}

        ${alertRow(product)}
      </div>
    </article>
  `;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

async function refreshList() {
  const response = await send({ type: 'list' });

  if (!response.ok) {
    listEl.innerHTML = `<div class="state">
      <h2>Ocular isn't responding</h2>
      <p>${escapeHtml(response.error)}</p>
      <p>Reload the extension from ${escapeHtml(extensionsUrl())}.</p>
    </div>`;
    summaryEl.textContent = 'disconnected';
    return;
  }

  const products = response.products || [];

  listEl.innerHTML = products.length
    ? products.map(renderRow).join('')
    : `<div class="state">
         <h2>Nothing watched yet</h2>
         <p>Open a product page on a supported store and press
            <strong>Monitor price</strong>.</p>
       </div>`;

  const errors = products.filter((product) => product.lastError).length;
  summaryEl.textContent = products.length
    ? `${products.length} watched${errors ? ` · ${errors} need attention` : ''}`
    : '';
}

async function renderBanner() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !looksLikeProductPage(tab.url)) return;

  const status = await send({ type: 'isTracked', url: tab.url });
  if (!status.ok || status.tracked) return;

  bannerEl.hidden = false;
  bannerEl.innerHTML = `
    <p class="banner__label">${escapeHtml(tab.title || tab.url)}</p>
    <button id="track-current" class="btn btn--primary btn--sm">Monitor</button>
  `;

  document.getElementById('track-current').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Adding…';

    // Prefer the price the content script can already see on the live page.
    const observed = await chrome.tabs.sendMessage(tab.id, { type: 'ocular:scrape' }).catch(() => null);
    const result = await send({ type: 'track', url: tab.url, observed: observed?.ok ? observed : null });

    if (result.ok) {
      bannerEl.hidden = true;
      await refreshList();
    } else {
      button.disabled = false;
      button.textContent = 'Retry';
    }
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

listEl.addEventListener('change', (event) => {
  const select = event.target.closest('[data-role="alert-type"]');
  if (!select) return;

  const input = select.parentElement.querySelector('[data-role="alert-value"]');
  const needsValue = select.value === 'absolute' || select.value === 'percent';
  input.hidden = !needsValue;
  input.placeholder = select.value === 'percent' ? '%' : '0';
  if (needsValue) input.focus();
});

listEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;

  const row = button.closest('.row');
  const id = row.dataset.id;
  button.disabled = true;

  switch (button.dataset.act) {
    case 'check':
      await send({ type: 'check', id });
      await refreshList();
      return;

    case 'remove':
      await send({ type: 'untrack', id });
      await refreshList();
      return;

    case 'toggle':
      await send({
        type: 'setStatus',
        id,
        status: row.classList.contains('row--paused') ? 'active' : 'paused',
      });
      await refreshList();
      return;

    case 'save-alert': {
      const type = row.querySelector('[data-role="alert-type"]').value;
      const value = Number.parseFloat(row.querySelector('[data-role="alert-value"]').value);

      let target = null;
      if (type === 'median') target = { type: 'median' };
      else if ((type === 'absolute' || type === 'percent') && Number.isFinite(value) && value > 0) {
        target = { type, value };
      }

      const result = await send({ type: 'setTarget', id, target });
      button.innerHTML = result.ok ? icons.check : '!';
      setTimeout(() => {
        button.textContent = 'Set';
        button.disabled = false;
      }, 1200);
      return;
    }

    default:
      button.disabled = false;
  }
});

async function withBusy(button, work) {
  button.disabled = true;
  const result = await work();
  button.disabled = false;
  return result;
}

document.getElementById('refresh').addEventListener('click', async (event) => {
  await withBusy(event.currentTarget, async () => {
    await send({ type: 'checkAll' });
    await refreshList();
  });
});

document.getElementById('export').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const result = await withBusy(button, () => send({ type: 'exportBackup' }));
  button.innerHTML = result.ok ? icons.check : icons.download;
  setTimeout(() => {
    button.innerHTML = icons.download;
  }, 1500);
});

document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function initNotifyToggle() {
  const notifyBtn = document.getElementById('notify-toggle');
  if (!notifyBtn) return;

  const optionsRes = await send({ type: 'getOptions' });
  const options = optionsRes?.options || {};
  let notifyEnabled = options.notifyAny !== false;

  const updateNotifyUI = () => {
    notifyBtn.innerHTML = notifyEnabled ? icons.bell : icons.bellOff;
    notifyBtn.classList.toggle('iconbtn--active', notifyEnabled);
    notifyBtn.title = notifyEnabled ? 'Notifications ON — click to mute' : 'Notifications OFF — click to turn on';
  };

  updateNotifyUI();

  notifyBtn.addEventListener('click', async () => {
    notifyEnabled = !notifyEnabled;
    updateNotifyUI();
    await send({ type: 'saveOptions', options: { ...options, notifyAny: notifyEnabled } });
  });
}

async function initLoginBanner() {
  const loginDesc = document.getElementById('login-banner-desc');
  const loginAction = document.getElementById('login-banner-action');
  const loginBtn = document.getElementById('login-btn');
  if (!loginDesc || !loginAction || !loginBtn) return;

  const optionsRes = await send({ type: 'getOptions' });
  const options = optionsRes?.options || {};

  const currentEmail = options.userEmail || options.email || null;

  if (currentEmail) {
    loginDesc.textContent = currentEmail;
    loginBtn.textContent = 'Logged in';
    loginBtn.style.background = 'rgba(71, 205, 137, 0.2)';
    loginBtn.style.color = '#47cd89';
    loginBtn.style.border = '1px solid rgba(71, 205, 137, 0.4)';
  } else {
    loginBtn.addEventListener('click', () => {
      loginAction.innerHTML = `
        <input type="email" id="user-email-input" class="login-card-banner__input" placeholder="Enter email..." />
        <button id="save-email-btn" class="gemini-btn-login" style="padding:0 10px;">Save</button>
      `;
      const emailInput = document.getElementById('user-email-input');
      const saveBtn = document.getElementById('save-email-btn');
      emailInput.focus();

      saveBtn.addEventListener('click', async () => {
        const val = emailInput.value.trim();
        if (!val || !val.includes('@')) return;
        saveBtn.disabled = true;
        saveBtn.textContent = '...';

        await send({ type: 'saveOptions', options: { ...options, userEmail: val } });
        loginDesc.textContent = val;
        loginAction.innerHTML = `
          <button class="gemini-btn-login" style="background:rgba(71, 205, 137, 0.2);color:#47cd89;border:1px solid rgba(71, 205, 137, 0.4);">Logged in</button>
        `;
      });
    });
  }
}

(async function init() {
  document.getElementById('wordmark').insertAdjacentHTML('afterbegin', eyeMark);
  document.getElementById('refresh').innerHTML = icons.refresh;
  document.getElementById('export').innerHTML = icons.download;
  document.getElementById('settings').innerHTML = icons.sliders;

  await Promise.all([refreshList(), renderBanner(), initNotifyToggle(), initLoginBanner()]);
})();
