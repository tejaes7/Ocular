/**
 * Backup, restore, and merge.
 *
 * Price history is the only thing here that can't be recreated — a product URL
 * can be re-added in seconds, but six months of observations cannot. It lives in
 * chrome.storage.local, which is destroyed if the extension is removed or the
 * unpacked folder moves. So: versioned exports, validated imports, and merges
 * that never destroy data.
 *
 * Import is a **merge, not a replace**. Restoring an old backup must not delete
 * products added since, and must not truncate histories that have grown.
 */

import { mergeHistory } from '@ocular/shared/history';
import {
  SCHEMA_VERSION,
  getHistory,
  getSettings,
  listProducts,
  saveMeta,
  saveSettings,
  setHistory,
  upsertProduct,
} from './store.js';

export const BACKUP_FORMAT = 'ocular-backup';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested — see test/backup.test.mjs)
// ---------------------------------------------------------------------------

/** Keep whichever product record knows more; never drop a user's target price. */
export function mergeProduct(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...incoming,
    ...existing,
    // Fields where "has a value" beats "is empty", regardless of side.
    title: existing.title && existing.title !== 'Untitled product' ? existing.title : incoming.title,
    image: existing.image || incoming.image,
    target: existing.target || incoming.target,
    createdAt: Math.min(existing.createdAt || Date.now(), incoming.createdAt || Date.now()),
    lastCheckedAt: Math.max(existing.lastCheckedAt || 0, incoming.lastCheckedAt || 0),
  };
}

/** Structural validation. Returns every problem, not just the first. */
export function validateBackup(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['File is not a JSON object.'] };
  }
  if (data.format !== BACKUP_FORMAT) {
    errors.push(`Not an Ocular backup (found format "${data.format ?? 'none'}").`);
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    errors.push('Missing or invalid schema version.');
  }
  if (data.version > SCHEMA_VERSION) {
    errors.push(
      `Backup is from a newer version of Ocular (schema ${data.version}, this build understands ${SCHEMA_VERSION}). Update the extension first.`
    );
  }
  if (!Array.isArray(data.products)) {
    errors.push('Missing "products" array.');
  } else {
    for (const [i, product] of data.products.entries()) {
      if (!product?.id) errors.push(`Product ${i + 1} has no id.`);
      if (!product?.canonicalUrl) errors.push(`Product ${i + 1} has no canonicalUrl.`);
    }
  }
  if (data.history && typeof data.history !== 'object') {
    errors.push('"history" must be an object keyed by product id.');
  }

  return { ok: errors.length === 0, errors };
}

/** Bring older exports up to the current shape. */
export function migrate(data) {
  const out = { ...data };

  if (out.version < 2) {
    // v1 had no host strategy memory and no per-product learned selector.
    out.hosts = out.hosts || {};
    out.products = (out.products || []).map((product) => ({
      status: 'active',
      currency: 'INR',
      ...product,
    }));
    out.version = 2;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function buildBackup(appVersion = '0.0.0') {
  const products = await listProducts();
  const history = {};
  for (const product of products) {
    history[product.id] = await getHistory(product.id);
  }

  const settings = await getSettings();
  // Never write a user's API key into a file that lands in their Downloads folder.
  const safeSettings = { ...settings, ai: { ...settings.ai, apiKey: '' } };

  return {
    format: BACKUP_FORMAT,
    version: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    products,
    history,
    settings: safeSettings,
  };
}

export function backupFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `ocular-backup-${stamp}.json`;
}

/**
 * Service workers have no `URL.createObjectURL`, so downloads go out as a data
 * URL. `encodeURIComponent` rather than base64 keeps it UTF-8 safe without
 * chunked binary string building.
 */
export function toDataUrl(backup) {
  const json = JSON.stringify(backup, null, 2);
  return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
}

export async function downloadBackup(appVersion, { silent = false } = {}) {
  const backup = await buildBackup(appVersion);
  const id = await chrome.downloads.download({
    url: toDataUrl(backup),
    filename: backupFilename(),
    saveAs: !silent,
    conflictAction: 'uniquify',
  });
  await saveMeta({ lastBackupAt: Date.now() });
  return { id, products: backup.products.length };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Merge a backup into current storage.
 *
 * @returns {{added: number, merged: number, pointsAdded: number}}
 */
export async function restoreBackup(raw, { includeSettings = false } = {}) {
  const check = validateBackup(raw);
  if (!check.ok) {
    throw new Error(check.errors.join('\n'));
  }

  const data = migrate(raw);
  const existing = new Map((await listProducts()).map((product) => [product.id, product]));

  let added = 0;
  let merged = 0;
  let pointsAdded = 0;

  for (const incoming of data.products) {
    const current = existing.get(incoming.id) || null;
    await upsertProduct(mergeProduct(current, incoming));
    current ? merged++ : added++;

    const incomingHistory = data.history?.[incoming.id] || [];
    if (incomingHistory.length) {
      const before = await getHistory(incoming.id);
      const union = mergeHistory(before, incomingHistory);
      pointsAdded += Math.max(0, union.length - before.length);
      await setHistory(incoming.id, union);
    }
  }

  if (includeSettings && data.settings) {
    const { ai, ...rest } = data.settings;
    // Import behavioural settings, but keep whatever credentials are already set.
    await saveSettings(rest);
  }

  return { added, merged, pointsAdded };
}
