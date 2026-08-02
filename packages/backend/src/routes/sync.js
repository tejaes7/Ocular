/**
 * POST /sync — push the watchlist up, pull server-observed prices down.
 *
 * OWNER: Rohith (API + storage). Coordinate with Harsha before changing the
 * `products` table shape, since the cron checker reads it.
 *
 * Deliberately idempotent: the extension may call this as often as it likes and
 * the worst case is a few redundant writes.
 */

import { deviceIdFrom, fail, json } from '../lib/http.js';
import {
  deleteProducts,
  isDeviceLinked,
  listProductIds,
  pricesSince,
  touchDevice,
  upsertProductStatements,
} from '../db/queries.js';

const MAX_PRODUCTS_PER_DEVICE = 200;
const MAX_PRICE_ROWS = 5000;

/**
 * Trim an over-full page to rows we can hand back a safe cursor for.
 *
 * `pricesSince` filters on `ts > since`, so the cursor must never sit in the
 * middle of a group of rows sharing one timestamp — the next request would skip
 * that group's remaining siblings.
 *
 * The probe row (the one fetched past the cap) is what makes this precise: if it
 * carries a different timestamp than the last row we are keeping, that group is
 * whole and the full page ships. Only when the group actually straddles the
 * boundary is it held back for the next round trip.
 *
 * The guard: if *every* row in the page shares one timestamp, dropping the group
 * empties the page and the sync can never advance. That is pathological — 5000
 * readings recorded in the same millisecond — so the rows are kept and the
 * cursor is allowed to land mid-group rather than deadlocking the client.
 *
 * @param {Array} page  cap + 1 rows, ordered by ts ascending
 * @param {number} cap  how many may be sent
 */
function trimToWholeTimestamp(page, cap) {
  const kept = page.slice(0, cap);
  const boundaryTs = kept[kept.length - 1].ts;

  if (page[cap].ts !== boundaryTs) return kept;

  const cut = kept.findIndex((row) => row.ts === boundaryTs);
  return cut <= 0 ? kept : kept.slice(0, cut);
}

export async function handleSync(request, env) {
  const deviceId = deviceIdFrom(request);
  if (!deviceId) return fail('UNAUTHORIZED', 'Missing or malformed device token', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return fail('BAD_REQUEST', 'Body must be JSON', 400);
  }

  const incoming = Array.isArray(body.products) ? body.products : [];

  // Refuse rather than truncate. This used to `.slice(0, MAX)`, and because the
  // reconcile pass below treats "not in the payload" as "the user deleted it",
  // the overflow was not merely ignored — it was deleted, along with its entire
  // price history. Syncing 250 products silently destroyed 50 of them.
  //
  // Erroring keeps every row intact and puts the cap in front of the user, who
  // is the only one who can decide what to stop tracking.
  if (incoming.length > MAX_PRODUCTS_PER_DEVICE) {
    return fail(
      'TOO_MANY_PRODUCTS',
      `This device is tracking ${incoming.length} products; the limit is ${MAX_PRODUCTS_PER_DEVICE}. Nothing was changed.`,
      413
    );
  }

  const since = Number.isFinite(body.since) ? body.since : 0;
  const now = Date.now();

  await touchDevice(env, deviceId, now);

  // The device's watchlist is authoritative: anything it stops sending stops
  // being checked here too. Otherwise removing a product in the browser would
  // leave the server quietly hammering a retailer for it forever.
  const keep = new Set();
  const writes = [];

  for (const product of incoming) {
    if (!product?.id || !product?.canonicalUrl) continue;

    let hostname;
    try {
      hostname = new URL(product.canonicalUrl).hostname;
    } catch {
      continue; // not a URL we can ever fetch
    }

    keep.add(product.id);
    writes.push(...upsertProductStatements(env, { deviceId, product, hostname, now }));
  }

  if (writes.length) await env.DB.batch(writes);

  // Reconciling deletes is only sound if the payload is the *whole* watchlist.
  // A caller that sent a page, a retry of one product, or a list its own client
  // had already trimmed would otherwise have the remainder deleted here. So the
  // client has to say so, explicitly: absent the flag we write and never delete.
  if (body.complete === true) {
    const existing = await listProductIds(env, deviceId);
    const stale = existing.filter((id) => !keep.has(id));
    if (stale.length) await deleteProducts(env, deviceId, stale);
  }

  // One row over the cap tells us whether more is waiting without a second query.
  const page = await pricesSince(env, deviceId, since, MAX_PRICE_ROWS + 1);
  const truncated = page.length > MAX_PRICE_ROWS;
  const rows = truncated ? trimToWholeTimestamp(page, MAX_PRICE_ROWS) : page;

  // Where the *next* sync should resume from.
  //
  // This is the whole of the bug it replaces: the client used to advance its
  // cursor to `serverTime` unconditionally, so on a truncated page everything
  // past row 5000 fell into a window that had already been marked as read and
  // was never requested again. Rows older than the cap were lost to the client
  // permanently. On a truncated page the cursor is the last row we actually
  // sent; only a complete page may advance to now.
  const nextSince = truncated ? rows[rows.length - 1].ts : now;

  const prices = {};
  for (const row of rows) {
    (prices[row.product_id] ||= []).push({
      ts: row.ts,
      price: row.price,
      inStock: row.in_stock === 1,
      source: 'server',
    });
  }

  // Reported, not accepted: /sync can tell the extension whether this device is
  // linked, but it can never change that. Creating the join stays confined to
  // /link, which is the one route that sees both identities.
  const linked = await isDeviceLinked(env, deviceId);

  return json({
    ok: true,
    serverTime: now,
    // The cursor the client must persist. `serverTime` stays for display; it is
    // no longer safe to sync from.
    nextSince,
    truncated,
    tracking: keep.size,
    prices,
    linked,
  });
}
