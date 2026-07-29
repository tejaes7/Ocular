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

import { mergeHistory } from '@ocular/shared/history';
import { getDeviceId, getHistory, getMeta, listProducts, saveMeta, setHistory } from './store.js';

const SYNC_TIMEOUT_MS = 15000;

export function syncConfigured(settings) {
  return Boolean(settings?.sync?.enabled && settings.sync.endpoint);
}

/**
 * Push the watchlist, pull back anything the server saw while we were closed.
 *
 * @returns {{ok: boolean, pulled?: number, tracking?: number, error?: string}}
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

  const pulled = await applyServerPrices(payload.prices || {});
  await saveMeta({ lastSyncAt: payload.serverTime || Date.now() });

  return { ok: true, pulled, tracking: payload.tracking };
}

/**
 * Merge server observations into local history.
 *
 * mergeHistory() sorts by timestamp and re-collapses runs of identical prices,
 * so a server reading that agrees with the browser adds nothing, and one that
 * lands in a gap slots into place. Re-pulling the same window is a no-op.
 */
async function applyServerPrices(pricesByProduct) {
  let added = 0;

  for (const [productId, points] of Object.entries(pricesByProduct)) {
    if (!Array.isArray(points) || !points.length) continue;

    const clean = points
      .filter((point) => Number.isFinite(point?.ts) && Number.isFinite(point?.price) && point.price > 0)
      .map((point) => ({
        ts: point.ts,
        lastSeen: point.ts,
        price: point.price,
        inStock: point.inStock !== false,
        source: 'server',
      }));
    if (!clean.length) continue;

    const before = await getHistory(productId);
    // A product the server knows about but this device no longer tracks.
    if (!before.length && !(await hasProduct(productId))) continue;

    const merged = mergeHistory(before, clean);
    if (merged.length !== before.length) {
      await setHistory(productId, merged);
      added += merged.length - before.length;
    }
  }

  return added;
}

async function hasProduct(id) {
  const products = await listProducts();
  return products.some((product) => product.id === id);
}
