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
function medianOfSorted(arr) {
  if (!arr || !arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

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
    median90: medianOfSorted(recentSorted),
    first: prices[0],
    points: history.length,
    since: history[0].ts,
  };
}

// ---------------------------------------------------------------------------
// Plausibility gate
// ---------------------------------------------------------------------------

/** Rungs that read a machine-readable price the retailer published itself. */
const STRUCTURED_STRATEGIES = new Set(['jsonld', 'meta', 'microdata']);
/** Rungs aimed at a specific element on a known site. They rot, but they aim. */
const TARGETED_STRATEGIES = new Set(['selector', 'learned']);

// Deliberately asymmetric. Every observed misread has been an UNDERestimate —
// per-unit prices, EMI instalments, "you save" figures and the old cheapest-wins
// tie-break all produce a number below the real one. So the downside band is the
// tighter of the two.
const GUESS_MAX_DROP_PCT = 50;
const GUESS_MAX_RISE_PCT = 100;

/**
 * The same sanity check for readings that came from structured data.
 *
 * A trusted strategy used to skip this test entirely, on the reasoning that
 * JSON-LD and site selectors do not guess. They do not — but "did not guess"
 * only means the markup was parsed correctly, not that it described the product
 * the user is looking at. On a page whose main offer is missing (out of stock,
 * region-locked, a redirect stub) the ladder finds the next structured offer on
 * the page instead: a sponsored slot, a "similar items" carousel. That parses
 * perfectly and belongs to something else entirely, and because those slots are
 * reshuffled on every load it produced a different "price drop" each refresh.
 *
 * So the band is wide rather than absent. A genuine clearance can take 80% off;
 * nothing legitimate takes 98%.
 */
const TRUSTED_MAX_DROP_PCT = 90;
const TRUSTED_MAX_RISE_PCT = 400;

/**
 * Should this reading be allowed into the stored history?
 *
 * `docs/ARCHITECTURE.md` states that a wrong price is worse than no price: a bad
 * reading poisons the history, drags the median down, and fires a false "lowest
 * ever" alert. Every layer was written to honour that except the one that
 * actually writes — nothing stood between a guessed price and permanent storage.
 * This is that check.
 *
 * A guessed reading is not rejected for being surprising; it is rejected for
 * being *unverifiable*. Declining lets the checker escalate to a rung that can
 * confirm it, so a genuine crash still lands on the next pass.
 *
 * @returns {{ok: true} | {ok: false, reason: string, detail?: string}}
 */
export function isPlausibleReading({ price, strategy, confidence, stats }) {
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'invalid-price' };
  }

  // Nothing to compare against yet. Accept, or a new product could never
  // establish a first data point.
  const median = stats?.median90;
  if (!median || median <= 0) return { ok: true };

  const trusted =
    (STRUCTURED_STRATEGIES.has(strategy) || TARGETED_STRATEGIES.has(strategy)) &&
    confidence !== 'low';

  const maxDrop = trusted ? TRUSTED_MAX_DROP_PCT : GUESS_MAX_DROP_PCT;
  const maxRise = trusted ? TRUSTED_MAX_RISE_PCT : GUESS_MAX_RISE_PCT;

  const deltaPct = ((price - median) / median) * 100;

  if (deltaPct < -maxDrop) {
    return {
      ok: false,
      reason: 'implausible-drop',
      detail: `${strategy || 'unknown'} read ${price}, ${Math.abs(deltaPct).toFixed(0)}% below the usual ${median}`,
    };
  }
  if (deltaPct > maxRise) {
    return {
      ok: false,
      reason: 'implausible-rise',
      detail: `${strategy || 'unknown'} read ${price}, ${deltaPct.toFixed(0)}% above the usual ${median}`,
    };
  }

  return { ok: true };
}

/**
 * Strip unverifiable readings out of a stored history.
 *
 * Rows written before provenance existed carry no `strategy`, so nothing
 * distinguishes a JSON-LD reading from a blind guess. Two kinds of row are
 * known-good regardless:
 *
 *   - anything with a `strategy`, which means it was written after the
 *     plausibility gate existed and already passed it;
 *   - anything with `source: 'page-visit'`, which came from the content script.
 *     That path reads the live `document`, which always has layout, so the
 *     unrendered-heuristic bug could never affect it.
 *
 * Those form the trusted subset, and provenance-less rows are judged against
 * their median. Note this deliberately does *not* use the full history's median:
 * when most rows are bad the overall median is bad too, which is exactly the
 * situation this repairs — a ₹349 product read three times as ₹94.75 and ₹8.75
 * has a median of ₹94.75, and judging against that would delete the good rows
 * and keep the junk.
 *
 * With no trusted subset there is nothing to judge against, so the history comes
 * back untouched. Deleting data on a guess is the same mistake pointing the other
 * way.
 *
 * @returns {{history: object[], dropped: object[]}}
 */
export function repairHistory(history = []) {
  const points = history.filter((point) => point && Number.isFinite(point.price));
  const isTrusted = (point) => Boolean(point.strategy) || point.source === 'page-visit';
  const trusted = points.filter(isTrusted);

  if (!trusted.length || trusted.length === points.length) {
    return { history: points, dropped: [] };
  }

  const sorted = trusted.map((point) => point.price).sort((a, b) => a - b);
  const stats = { median90: medianOfSorted(sorted) };

  const kept = [];
  const dropped = [];

  for (const point of points) {
    if (isTrusted(point)) {
      kept.push(point);
      continue;
    }
    const verdict = isPlausibleReading({
      price: point.price,
      strategy: null,
      confidence: 'low',
      stats,
    });
    (verdict.ok ? kept : dropped).push(point);
  }

  // Removing a row can leave two identical readings adjacent, so re-collapse.
  return { history: dropped.length ? mergeHistory(kept) : points, dropped };
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
        // Provenance has to survive a merge. Rebuilding the point field-by-field
        // silently dropped these, so any sync or backup import erased the record
        // of which rung produced a reading — which is the one thing that makes a
        // suspect row identifiable afterwards.
        strategy: point.strategy || null,
        confidence: point.confidence || null,
      });
    }
  }
  return out;
}
