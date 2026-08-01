/**
 * Every D1 query in one place.
 *
 * OWNER: Rohith. Schema lives in migrations/ — change both together, and tell
 * Harsha, because the cron checker reads `products`.
 *
 * Keeping SQL out of the route and cron files is what lets those two be edited
 * independently without merge conflicts.
 */

export async function checkDbHealth(env) {
  if (!env?.DB) return false;
  try {
    const result = await env.DB.prepare('SELECT 1 as alive').first();
    return result?.alive === 1;
  } catch {
    return false;
  }
}

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
 * Products eligible for a cron check.
 *
 * Ordering by `last_checked_at` gives round-robin fairness for free — the
 * longest-neglected product is always first in line. Backed by idx_products_due.
 */
export async function dueProducts(env, { now, intervalMs, limit }) {
  const result = await env.DB.prepare(
    `SELECT * FROM products
     WHERE blocked_until <= ? AND last_checked_at <= ?
     ORDER BY last_checked_at ASC
     LIMIT ?`
  )
    .bind(now, now - intervalMs, limit)
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

export async function createRecoveryCode(env, { code, deviceId, now, expiresAt }) {
  return env.DB.prepare(
    `INSERT INTO recovery_codes (code, device_id, created_at, expires_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET device_id = excluded.device_id, expires_at = excluded.expires_at`
  )
    .bind(code, deviceId, now, expiresAt)
    .run();
}

export async function getRecoveryCode(env, code) {
  const result = await env.DB.prepare('SELECT code, device_id, expires_at FROM recovery_codes WHERE code = ?')
    .bind(code)
    .first();
  return result || null;
}

export async function deleteRecoveryCode(env, code) {
  return env.DB.prepare('DELETE FROM recovery_codes WHERE code = ?').bind(code).run();
}

export async function transferDeviceData(env, { oldDeviceId, newDeviceId }) {
  return env.DB.batch([
    env.DB.prepare('UPDATE OR IGNORE products SET device_id = ? WHERE device_id = ?').bind(
      newDeviceId,
      oldDeviceId
    ),
    env.DB.prepare('UPDATE OR IGNORE prices SET device_id = ? WHERE device_id = ?').bind(
      newDeviceId,
      oldDeviceId
    ),
    env.DB.prepare('DELETE FROM products WHERE device_id = ?').bind(oldDeviceId),
    env.DB.prepare('DELETE FROM prices WHERE device_id = ?').bind(oldDeviceId),
  ]);
}
