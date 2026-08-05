/** Formatting helpers shared by the popup, the in-page panel and the options UI. */

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', SGD: 'S$' };
const LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', CAD: 'en-CA', AUD: 'en-AU' };

export function money(value, currency = 'INR') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const symbol = SYMBOLS[currency] ?? '';
  const locale = LOCALES[currency] ?? 'en-US';
  const rounded = Number(value);
  const decimals = Number.isInteger(rounded) ? 0 : 2;
  return `${symbol}${rounded.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function relativeTime(ts) {
  if (!ts) return 'never';
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function percentChange(from, to) {
  if (!from || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/** Human-readable reason for a failed check. Error codes are for logs, not users. */
export function explainError(code) {
  return (
    {
      blocked: 'The site blocked the check. Ocular will retry later.',
      'http-error': 'The site returned an error.',
      gone: 'This product page no longer exists.',
      'no-price': "Couldn't find a price on the page.",
      'fetch-failed': 'Network request failed.',
      'tab-timeout': 'The page took too long to load.',
      'parse-error': 'The page could not be read.',
      'no-strategy': 'No working way to check this site yet.',
    }[code] || code
  );
}
