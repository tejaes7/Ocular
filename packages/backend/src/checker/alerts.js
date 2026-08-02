/**
 * Deciding when a server-observed price drop is worth an email.
 *
 * OWNER: Harsha (checking pipeline), with Rohith for the queries it leans on.
 *
 * The alert *rules* are not implemented here. `evaluateAlert` comes from
 * @ocular/shared, the same function the extension calls, because the one thing
 * this must never do is disagree with the extension about what counts as a deal
 * — docs/ARCHITECTURE.md is explicit that a divergence there makes the product
 * contradict itself. What lives here is only the question the extension never
 * has to ask: *should we reach outside the browser for this one?*
 *
 * Four constraints shape that answer, and each one exists to stop a specific
 * bad email:
 *
 *   1. Only when the browser is actually away. If the device synced an hour
 *      ago, the extension is running and will raise its own notification when
 *      it next pulls. Emailing as well means two alerts for one price drop.
 *   2. Only with enough server-side history. The browser never uploads its
 *      history (sync.js sends "no prices, no history" on purpose), so the
 *      median here is computed from server readings alone and is far thinner
 *      than the extension's. A median built from two points is not a median.
 *   3. Only once per price. Without this the cron re-sends the same email every
 *      30 minutes for as long as the price stays low.
 *   4. Never twice inside the cooldown, even for a further drop. A price
 *      oscillating around a threshold would otherwise mail on every crossing.
 */

import { evaluateAlert } from '@ocular/shared/alerts';
import { summarizeHistory } from '@ocular/shared/history';

/** A device seen more recently than this has a live browser to notify itself. */
export const DEVICE_AWAY_MS = 6 * 60 * 60 * 1000;

/** Below this many server readings, the 90-day median is not worth trusting. */
export const MIN_POINTS_FOR_EMAIL = 5;

/** Minimum gap between two emails about the same product. */
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Deliberately stricter than the extension's 5% default.
 *
 * An email is more intrusive than a desktop toast and cannot be dismissed as
 * cheaply, and it is being decided on thinner history. `target` is absent
 * because per-product targets live in chrome.storage and are never synced — so
 * the only rule that can fire server-side is the generic drop, which is the
 * honest limit of what the server knows.
 */
export const SERVER_ALERT_SETTINGS = {
  notifyOnAnyDrop: true,
  minDropPercentToNotify: 10,
};

/**
 * @param {object} args
 * @param {object} args.product        the products row, incl. last_alert_* state
 * @param {Array}  args.history        server price rows, oldest first
 * @param {number} args.price          the reading just taken
 * @param {number} args.deviceLastSeen devices.last_seen_at
 * @param {number} args.now
 * @returns {{send: boolean, reason: string, verdict?: object, previousPrice?: number}}
 */
export function shouldEmail({ product, history, price, deviceLastSeen, now }) {
  if (now - (deviceLastSeen || 0) < DEVICE_AWAY_MS) {
    return { send: false, reason: 'device-active' };
  }

  const stats = summarizeHistory(history);
  if (!stats || stats.points < MIN_POINTS_FOR_EMAIL) {
    return { send: false, reason: 'thin-history' };
  }

  // The reading before this one. `history` already includes the new row, so the
  // comparison point is the one behind it.
  const previous = history[history.length - 2];
  const previousPrice = previous?.price;
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) {
    return { send: false, reason: 'no-previous-price' };
  }

  const verdict = evaluateAlert({
    target: null,
    stats,
    previousPrice,
    price,
    settings: SERVER_ALERT_SETTINGS,
  });
  if (!verdict.fire) return { send: false, reason: 'no-alert' };

  // A further drop is still news; the same price, or a partial recovery, is not.
  if (Number.isFinite(product.last_alert_price) && price >= product.last_alert_price) {
    return { send: false, reason: 'already-alerted' };
  }

  if (product.last_alert_at && now - product.last_alert_at < ALERT_COOLDOWN_MS) {
    return { send: false, reason: 'cooldown' };
  }

  return { send: true, reason: 'alert', verdict, previousPrice };
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

function money(amount, currency) {
  const value = Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return currency === 'INR' ? `₹${value}` : `${value} ${currency || ''}`.trim();
}

/**
 * Build the alert email.
 *
 * Plain and specific rather than marketed. This arrives unprompted about
 * something the person is thinking of buying, so it says what changed, what it
 * costs now, and how to stop receiving it — and nothing else.
 */
export function composeAlertEmail({ product, price, previousPrice, verdict }) {
  const currency = product.currency || 'INR';
  const title = product.title || 'A product you are watching';
  const url = product.url || product.canonical_url;

  const subject = `${money(price, currency)} — ${title.slice(0, 60)}`;

  const text = [
    `${verdict.label}.`,
    '',
    title,
    `${money(previousPrice, currency)} → ${money(price, currency)}`,
    '',
    url,
    '',
    'Ocular checked this while your browser was closed.',
    'To stop these, turn off email alerts in the extension options.',
  ].join('\n');

  const html = `
    <div style="font-family:ui-sans-serif,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;color:#0f1114">
      <p style="font-size:13px;color:#5b6069;margin:0 0 14px">${escapeHtml(verdict.label)}</p>
      <p style="font-size:15px;margin:0 0 6px">${escapeHtml(title)}</p>
      <p style="font-size:24px;font-weight:600;margin:0 0 18px">
        ${escapeHtml(money(price, currency))}
        <span style="font-size:14px;font-weight:400;color:#8d939c;text-decoration:line-through;margin-left:8px">
          ${escapeHtml(money(previousPrice, currency))}
        </span>
      </p>
      <p style="margin:0 0 22px"><a href="${escapeHtml(url)}" style="color:#0f1114">View the product</a></p>
      <p style="font-size:11.5px;color:#8d939c;line-height:1.5;margin:0">
        Ocular checked this while your browser was closed.<br />
        To stop these, turn off email alerts in the extension options.
      </p>
    </div>
  `.trim();

  return { subject, text, html };
}
