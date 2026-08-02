/**
 * Every D1 query in one place.
 *
 * OWNER: Rohith. Schema lives in migrations/ — change both together, and tell
 * Harsha, because the cron checker reads `products`.
 *
 * Keeping SQL out of the route and cron files is what lets those two be edited
 * independently without merge conflicts.
 */

export async function touchDevice(env, deviceId, now) {
  return env.DB.prepare(
    `INSERT INTO devices (id, created_at, last_seen_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
  )
    .bind(deviceId, now, now)
    .run();
}

export function upsertProductStatements(env, { deviceId, product, hostname, now }) {
  return [
    env.DB.prepare(
      `INSERT INTO products (id, device_id, url, canonical_url, hostname, title, currency, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id, id) DO UPDATE SET
         url = excluded.url,
         canonical_url = excluded.canonical_url,
         hostname = excluded.hostname,
         title = COALESCE(excluded.title, products.title)`
    ).bind(
      product.id,
      deviceId,
      product.url || product.canonicalUrl,
      product.canonicalUrl,
      hostname,
      product.title || null,
      product.currency || 'INR',
      now
    ),
  ];
}

export async function listProductIds(env, deviceId) {
  const result = await env.DB.prepare('SELECT id FROM products WHERE device_id = ?')
    .bind(deviceId)
    .all();
  return (result.results || []).map((row) => row.id);
}

export async function deleteProducts(env, deviceId, ids) {
  const placeholders = ids.map(() => '?').join(',');
  return env.DB.batch([
    env.DB.prepare(`DELETE FROM products WHERE device_id = ? AND id IN (${placeholders})`).bind(
      deviceId,
      ...ids
    ),
    env.DB.prepare(`DELETE FROM prices WHERE device_id = ? AND product_id IN (${placeholders})`).bind(
      deviceId,
      ...ids
    ),
  ]);
}

export async function pricesSince(env, deviceId, since, limit) {
  const result = await env.DB.prepare(
    `SELECT product_id, ts, price, in_stock FROM prices
     WHERE device_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?`
  )
    .bind(deviceId, since, limit)
    .all();
  return result.results || [];
}

/**
 * A device that has not synced in this long stops having its watchlist checked.
 *
 * Nothing is deleted and nothing needs cleaning up: `touchDevice` runs on every
 * sync, so a device that comes back is picked up again on its very next tick.
 */
const DORMANT_DEVICE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Products eligible for a cron check.
 *
 * Ordering by `last_checked_at` gives round-robin fairness for free — the
 * longest-neglected product is always first in line. Backed by idx_products_due.
 *
 * The join skips dormant devices. Without it, someone who installs the
 * extension, syncs once and uninstalls leaves their watchlist being fetched
 * forever. That costs twice: it burns the 40-checks-per-cron budget on a device
 * that will never read the result — starving the users who *are* listening of
 * fresh prices — and it keeps sending traffic to retailers on nobody's behalf,
 * which is exactly what gets the worker's IP blocked (see checker/cron.js).
 */
export async function dueProducts(env, { now, intervalMs, limit }) {
  const result = await env.DB.prepare(
    `SELECT p.* FROM products p
       JOIN devices d ON d.id = p.device_id
     WHERE p.blocked_until <= ? AND p.last_checked_at <= ? AND d.last_seen_at > ?
     ORDER BY p.last_checked_at ASC
     LIMIT ?`
  )
    .bind(now, now - intervalMs, now - DORMANT_DEVICE_MS, limit)
    .all();
  return result.results || [];
}

export async function recordSuccess(env, product, { now, price, inStock, title }) {
  return env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO prices (device_id, product_id, ts, price, in_stock)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(product.device_id, product.id, now, price, inStock ? 1 : 0),

    env.DB.prepare(
      `UPDATE products SET fail_count = 0, blocked_until = 0, last_checked_at = ?,
         last_price = ?, last_error = NULL, title = COALESCE(title, ?)
       WHERE device_id = ? AND id = ?`
    ).bind(now, price, title || null, product.device_id, product.id),
  ]);
}

export async function recordFailure(env, product, { now, failures, blockedUntil, reason }) {
  return env.DB.prepare(
    `UPDATE products SET fail_count = ?, blocked_until = ?, last_checked_at = ?, last_error = ?
     WHERE device_id = ? AND id = ?`
  )
    .bind(failures, blockedUntil, now, reason, product.device_id, product.id)
    .run();
}
