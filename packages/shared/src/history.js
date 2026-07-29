/**
 * Price-history maths. Pure — no chrome APIs, no DOM, no storage.
 *
 * Lives in @ocular/shared because three places need identical answers:
 *   - the extension, to render the popup and evaluate alert rules
 *   - the backend, to decide what to report and (later) to notify on
 *   - the AI service, to build features from a history series
 *
 * If these ever disagree, the product lies to the user. Change them here only.
 */

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Summary statistics for a price series.
 *
 * `median90` is the anchor for every relative alert rule. It is a median rather
 * than a mean, and windowed to 90 days rather than all time, so that a single
 * pre-sale price spike can't drag the "usual price" upward and make a fake
 * discount look real.
 */
export function summarizeHistory(history) {
  if (!history?.length) return null;

  const prices = history.map((point) => point.price);
  const sorted = [...prices].sort((a, b) => a - b);

  const cutoff = Date.now() - NINETY_DAYS_MS;
  const recent = history.filter((point) => point.lastSeen >= cutoff).map((point) => point.price);
  // Fall back to the whole series when the window is empty, so a long-dormant
  // product still reports a usable "usual price" instead of null.
  const recentSorted = [...(recent.length ? recent : prices)].sort((a, b) => a - b);

  return {
    current: prices[prices.length - 1],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median90: recentSorted[Math.floor(recentSorted.length / 2)],
    first: prices[0],
    points: history.length,
    since: history[0].ts,
  };
}

/**
 * Union two price histories.
 *
 * Points are ordered by timestamp and consecutive identical readings are
 * re-collapsed, matching how the extension stores them. This is what makes
 * both backup import and server sync idempotent: merging a series that is
 * already present adds nothing.
 */
export function mergeHistory(a = [], b = []) {
  const valid = [...a, ...b].filter(
    (point) => point && Number.isFinite(point.ts) && Number.isFinite(point.price)
  );
  valid.sort((x, y) => x.ts - y.ts);

  const out = [];
  for (const point of valid) {
    const last = out[out.length - 1];
    const seen = Number.isFinite(point.lastSeen) ? point.lastSeen : point.ts;

    if (last && last.price === point.price && last.inStock === point.inStock) {
      last.lastSeen = Math.max(last.lastSeen, seen);
    } else {
      out.push({
        ts: point.ts,
        lastSeen: Math.max(seen, point.ts),
        price: point.price,
        inStock: point.inStock !== false,
        source: point.source || 'import',
      });
    }
  }
  return out;
}
