import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BACKUP_FORMAT,
  backupFilename,
  mergeProduct,
  migrate,
  toDataUrl,
  validateBackup,
} from '../src/lib/backup.js';
import { SCHEMA_VERSION } from '../src/lib/store.js';

// mergeHistory / summarizeHistory moved to @ocular/shared — their tests live in
// packages/shared/test/history.test.mjs.

test('mergeProduct never discards a target the user set locally', () => {
  const existing = { id: 'p1', title: 'Local title', target: { type: 'absolute', value: 999 }, createdAt: 50 };
  const incoming = { id: 'p1', title: 'Backup title', target: null, createdAt: 10, lastCheckedAt: 900 };

  const merged = mergeProduct(existing, incoming);

  assert.deepEqual(merged.target, { type: 'absolute', value: 999 });
  assert.equal(merged.title, 'Local title');
  assert.equal(merged.createdAt, 10, 'keeps the earliest creation time');
  assert.equal(merged.lastCheckedAt, 900, 'keeps the most recent check');
});

test('mergeProduct fills in placeholder titles and missing images from the backup', () => {
  const merged = mergeProduct(
    { id: 'p1', title: 'Untitled product', image: null, createdAt: 5 },
    { id: 'p1', title: 'Sony WH-1000XM5', image: 'https://cdn/x.jpg', createdAt: 5 }
  );
  assert.equal(merged.title, 'Sony WH-1000XM5');
  assert.equal(merged.image, 'https://cdn/x.jpg');
});

test('mergeProduct returns the incoming record when nothing exists locally', () => {
  const incoming = { id: 'p2', title: 'New' };
  assert.equal(mergeProduct(null, incoming), incoming);
});

test('validateBackup accepts a well-formed export', () => {
  const result = validateBackup({
    format: BACKUP_FORMAT,
    version: SCHEMA_VERSION,
    products: [{ id: 'p1', canonicalUrl: 'https://x/p/1' }],
    history: {},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateBackup rejects foreign files and reports every problem', () => {
  const result = validateBackup({ format: 'something-else', products: 'nope' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3, `expected several errors, got ${result.errors.length}`);
});

test('validateBackup refuses a backup from a newer schema', () => {
  const result = validateBackup({
    format: BACKUP_FORMAT,
    version: SCHEMA_VERSION + 1,
    products: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /newer version/i);
});

test('validateBackup names the offending product index', () => {
  const result = validateBackup({
    format: BACKUP_FORMAT,
    version: SCHEMA_VERSION,
    products: [{ id: 'p1', canonicalUrl: 'https://x' }, { id: 'p2' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Product 2 has no canonicalUrl/);
});

test('validateBackup handles non-objects without throwing', () => {
  for (const bad of [null, undefined, 'string', 42]) {
    assert.equal(validateBackup(bad).ok, false);
  }
});

test('migrate brings a v1 export up to the current shape', () => {
  const migrated = migrate({
    format: BACKUP_FORMAT,
    version: 1,
    products: [{ id: 'p1', canonicalUrl: 'https://x/p/1' }],
  });

  assert.equal(migrated.version, SCHEMA_VERSION);
  assert.equal(migrated.products[0].status, 'active');
  assert.equal(migrated.products[0].currency, 'INR');
  assert.deepEqual(migrated.hosts, {});
});

test('migrate does not clobber fields the v1 export already had', () => {
  const migrated = migrate({
    version: 1,
    products: [{ id: 'p1', canonicalUrl: 'https://x', status: 'paused', currency: 'USD' }],
  });
  assert.equal(migrated.products[0].status, 'paused');
  assert.equal(migrated.products[0].currency, 'USD');
});

test('toDataUrl round-trips UTF-8 content such as the rupee sign', () => {
  const backup = { format: BACKUP_FORMAT, version: SCHEMA_VERSION, note: '₹1,29,999 — naïve' };
  const url = toDataUrl(backup);

  assert.ok(url.startsWith('data:application/json;charset=utf-8,'));
  const decoded = JSON.parse(decodeURIComponent(url.slice(url.indexOf(',') + 1)));
  assert.deepEqual(decoded, backup);
});

test('backupFilename is filesystem-safe', () => {
  const name = backupFilename(new Date('2026-07-29T14:05:09Z'));
  assert.equal(name, 'ocular-backup-2026-07-29-14-05-09.json');
  assert.doesNotMatch(name, /[:<>"|?*]/);
});
