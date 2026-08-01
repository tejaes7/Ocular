/**
 * POST /sync — push the watchlist up, pull server-observed prices down.
 *
 * OWNER: Rohith (API + storage). Coordinate with Harsha before changing the
 * `products` table shape, since the cron checker reads it.
 *
 * Deliberately idempotent: the extension may call this as often as it likes and
 * the worst case is a few redundant writes.
 */

import { deviceIdFrom, errorJson, json } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { validateSyncPayload } from '../lib/validation.js';
import {
  deleteProducts,
  listProductIds,
  pricesSince,
  touchDevice,
  upsertProductStatements,
} from '../db/queries.js';

const MAX_PRICE_ROWS = 5000;

export async function handleSync(request, env) {
  const deviceId = deviceIdFrom(request);
  if (!deviceId) {
    logger.warn('Sync rejected due to missing or invalid device token');
    return errorJson('Missing or malformed device token', 401, 'UNAUTHORIZED');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    logger.warn('Sync rejected due to invalid JSON payload');
    return errorJson('Body must be JSON', 400, 'INVALID_BODY');
  }

  const validation = validateSyncPayload(body);
  if (!validation.valid) {
    logger.warn('Sync payload validation failed', { error: validation.error });
    return errorJson(validation.error, 400, 'VALIDATION_ERROR');
  }

  const { since, products: incoming } = validation.data;
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

  const existing = await listProductIds(env, deviceId);
  const stale = existing.filter((id) => !keep.has(id));
  if (stale.length) await deleteProducts(env, deviceId, stale);

  const rows = await pricesSince(env, deviceId, since, MAX_PRICE_ROWS);

  const prices = {};
  for (const row of rows) {
    (prices[row.product_id] ||= []).push({
      ts: row.ts,
      price: row.price,
      inStock: row.in_stock === 1,
      source: 'server',
    });
  }

  return json({ ok: true, serverTime: now, tracking: keep.size, prices });
}
