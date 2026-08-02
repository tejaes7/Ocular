/**
 * Optional sync client for the Cloudflare worker.
 *
 * **The browser is the source of truth.** Server readings are advisory: they
 * only fill gaps in the local history, and a server observation never overwrites
 * or contradicts one made by the browser. That rule exists because the worker
 * runs on a datacenter IP and is the side more likely to be served a stale page,
 * a regional price, or an anti-bot placeholder.
 *
 * Off by default. Enabling it and pointing it at a deployment is a deliberate
 * choice the user makes in the options page.
 */

import { isPlausibleReading, mergeHistory, summarizeHistory } from '@ocular/shared/history';
import { getDeviceId, getHistory, getMeta, listProducts, saveMeta, setHistory } from './store.js';

const SYNC_TIMEOUT_MS = 15000;

export function syncConfigured(settings) {
  return Boolean(settings?.sync?.enabled && settings.sync.endpoint);
}

/**
 * Push the watchlist, pull back anything the server saw while we were closed.
 *
 * `catchUp` carries the products whose newest known price changed as a result —
 * the caller is expected to update those products and raise any alert. Merging
 * silently was the whole defect: see applyServerPrices below.
 *
 * @returns {{ok: boolean, pulled?: number, tracking?: number, catchUp?: Array, error?: string}}
 */
export async function runSync(settings) {
  if (!syncConfigured(settings)) return { ok: false, error: 'Sync is not configured.' };

  const endpoint = settings.sync.endpoint.replace(/\/$/, '');
  const deviceId = await getDeviceId();
  const meta = await getMeta();
  const products = await listProducts();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  let payload;
  try {
    const response = await fetch(`${endpoint}/sync`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deviceId}`,
      },
      body: JSON.stringify({
        since: meta.lastSyncAt || 0,
        // Only what the server needs to fetch a page. No prices, no history,
        // no settings, nothing about the person.
        products: products
          .filter((product) => product.status !== 'paused')
          .map(({ id, url, canonicalUrl, title, currency }) => ({
            id,
            url,
            canonicalUrl,
            title,
            currency,
          })),
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `Server responded ${response.status}` };
    }
    payload = await response.json();
  } catch (error) {
    return {
      ok: false,
      error: error.name === 'AbortError' ? 'Sync timed out.' : String(error.message || error),
    };
  } finally {
    clearTimeout(timer);
  }

  if (!payload?.ok) return { ok: false, error: payload?.error || 'Malformed sync response.' };

  const { added, catchUp } = await applyServerPrices(payload.prices || {});
  await saveMeta({ lastSyncAt: payload.serverTime || Date.now() });

  return { ok: true, pulled: added, tracking: payload.tracking, catchUp };
}

/**
 * Decide which server-sent points may enter local history.
 *
 * Pure and exported so the gate can be tested without chrome storage — the
 * whole defect this guards is a filtering decision, and a filter with no test
 * is how the unfiltered version survived in the first place.
 *
 * @param {Array} points  raw `{ ts, price, inStock }` rows from the worker
 * @param {object|null} stats  summarizeHistory() of what the device already has
 */
export function acceptableServerPoints(points, stats) {
  const accepted = [];
  let rejected = 0;

  for (const point of Array.isArray(points) ? points : []) {
    if (!Number.isFinite(point?.ts) || !Number.isFinite(point?.price) || point.price <= 0) {
      rejected += 1;
      continue;
    }

    // `strategy` is deliberately not passed: server rows carry no provenance, so
    // the gate treats them as untrusted and holds them to the median band. That
    // is the intent — a datacenter reading has to clear a bar a browser reading
    // does not.
    if (!isPlausibleReading({ price: point.price, stats }).ok) {
      rejected += 1;
      continue;
    }

    accepted.push({
      ts: point.ts,
      lastSeen: point.ts,
      price: point.price,
      inStock: point.inStock !== false,
      source: 'server',
    });
  }

  return { accepted, rejected };
}

/**
 * Decide whether a merge changed what this device believes the price *is*.
 *
 * Pure and exported for the same reason as the gate above: this is the decision
 * that turns a silent background merge into a notification, and getting it wrong
 * is either a missed price drop or a burst of spurious alerts.
 *
 * Two conditions, both load-bearing:
 *
 *   - The newest point after the merge must be the server's. A sync usually
 *     backfills *gaps* — readings older than the browser's own latest — and those
 *     change history without changing the current price. Alerting on them would
 *     announce a "drop" the user already lived through.
 *   - Only the single newest point is considered. Pulling a week of server rows
 *     after a long shutdown must produce one alert per product, not one per row.
 *
 * @returns {{price, inStock, ts, previousPrice}|null}
 */
export function catchUpFrom(before, after) {
  const newest = after[after.length - 1];
  if (!newest || newest.source !== 'server') return null;

  const previous = before[before.length - 1];
  if (previous && previous.ts >= newest.ts) return null;

  return {
    price: newest.price,
    inStock: newest.inStock,
    ts: newest.ts,
    // Null on a product whose history was empty: with nothing to compare
    // against there is no drop, and the caller will not raise an alert.
    previousPrice: previous ? previous.price : null,
  };
}

/**
 * Merge server observations into local history.
 *
 * mergeHistory() sorts by timestamp and re-collapses runs of identical prices,
 * so a server reading that agrees with the browser adds nothing, and one that
 * lands in a gap slots into place. Re-pulling the same window is a no-op.
 *
 * **Server readings are gated by isPlausibleReading() before they land.** They
 * used to skip it, which had the trust model backwards: the worker reads from a
 * datacenter IP, so it is the side more likely to be handed an anti-bot
 * placeholder, a regional price, or a stale page — as the header of this file
 * says. A junk reading merged here is permanent, drags the 90-day median down,
 * and fires a false "lowest ever". `mergeHistory` is not a defence: it only
 * stops a server point *overwriting* a browser one, and a bad point landing in
 * a gap overwrites nothing.
 *
 * What this used to do and no longer does: write history and stop. Nothing
 * updated `lastPrice`, so the popup, the badge and the in-page panel all kept
 * showing the old number while history held the new one, and nothing raised an
 * alert, so a drop the worker caught overnight reached the user as silence. The
 * entire server pipeline produced no visible outcome. Hence `catchUp`.
 */
async function applyServerPrices(pricesByProduct) {
  let added = 0;
  let rejected = 0;
  const catchUp = [];

  // Hoisted: this was called per product inside the loop, so a sync pulling N
  // products re-read the entire product list N times.
  const trackedIds = new Set((await listProducts()).map((product) => product.id));

  for (const [productId, points] of Object.entries(pricesByProduct)) {
    if (!Array.isArray(points) || !points.length) continue;

    const before = await getHistory(productId);

    // A product the server knows about but this device no longer tracks. Kept
    // as the original two-part condition on purpose — a product with local
    // history still accepts server points even if it has left the watchlist.
    if (!before.length && !trackedIds.has(productId)) continue;

    const { accepted: clean, rejected: dropped } = acceptableServerPoints(
      points,
      summarizeHistory(before)
    );
    rejected += dropped;

    if (!clean.length) continue;

    const merged = mergeHistory(before, clean);
    if (merged.length !== before.length) {
      await setHistory(productId, merged);
      added += merged.length - before.length;

      const event = catchUpFrom(before, merged);
      if (event) catchUp.push({ productId, ...event });
    }
  }

  if (rejected) {
    // Worth a line in the console: a server that suddenly starts producing
    // implausible readings means its extraction broke, and this is the only
    // place that would notice.
    console.warn(`[Sync] Rejected ${rejected} implausible server reading(s).`);
  }

  return { added, catchUp };
}
