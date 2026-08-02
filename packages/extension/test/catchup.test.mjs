/**
 * Whether a sync counts as "the price changed while you were away".
 *
 * The defect this closes: server prices were merged into history and nothing
 * else happened. `lastPrice` was never updated, so the popup, badge and in-page
 * panel kept showing the old number while history held the new one, and no
 * alert was raised — a drop the worker caught overnight reached the user as
 * silence. The whole server pipeline produced no visible outcome.
 *
 * The two failure modes on the other side of the fix are just as bad, and both
 * are what these tests pin down: alerting on backfilled history (announcing a
 * "drop" the user already lived through), and alerting once per merged row after
 * a long shutdown instead of once per product.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { catchUpFrom } from '../src/lib/sync.js';

const HOUR = 3_600_000;

/** `hoursAgo` counts backwards, so bigger numbers are older. */
const browser = (hoursAgo, price) => ({
  ts: Date.now() - hoursAgo * HOUR,
  lastSeen: Date.now() - hoursAgo * HOUR,
  price,
  inStock: true,
  source: 'check',
  strategy: 'json-ld',
  confidence: 'high',
});

const server = (hoursAgo, price) => ({
  ts: Date.now() - hoursAgo * HOUR,
  lastSeen: Date.now() - hoursAgo * HOUR,
  price,
  inStock: true,
  source: 'server',
});

test('a server reading newer than anything local is a catch-up', () => {
  const before = [browser(48, 10_000)];
  const after = [...before, server(2, 8_500)];

  const event = catchUpFrom(before, after);

  assert.ok(event, 'the price the user sees has changed — this must surface');
  assert.equal(event.price, 8_500);
  assert.equal(event.previousPrice, 10_000, 'the alert compares against what was newest before');
  assert.equal(event.inStock, true);
});

test('a server reading that only backfills a gap is not a catch-up', () => {
  // The worker saw a price two days ago; the browser has seen one since. History
  // gets richer, but the current price is unchanged and the user already knows
  // it. Alerting here would announce a drop they have already lived through.
  const before = [browser(72, 10_000), browser(1, 9_000)];
  const after = [browser(72, 10_000), server(48, 8_000), browser(1, 9_000)];

  assert.equal(catchUpFrom(before, after), null);
});

test('a long shutdown produces one catch-up, not one per merged row', () => {
  // Chrome closed for a week; the worker checked every three hours. Every one of
  // these rows is new, and only the newest describes the price now.
  const before = [browser(200, 10_000)];
  const after = [
    ...before,
    server(96, 9_800),
    server(72, 9_500),
    server(48, 9_200),
    server(24, 8_900),
    server(3, 8_400),
  ];

  const event = catchUpFrom(before, after);

  assert.equal(event.price, 8_400, 'the newest row is the current price');
  assert.equal(
    event.previousPrice,
    10_000,
    'compares against the last price the user actually saw, not the row before it'
  );
});

test('a rise is reported as a catch-up too — the caller decides what alerts', () => {
  // catchUpFrom answers "did the current price change", not "is this good news".
  // Keeping the drop test in the caller is what stops a price *rise* from
  // silently leaving a stale lastPrice on the product.
  const event = catchUpFrom([browser(48, 8_000)], [browser(48, 8_000), server(1, 9_500)]);

  assert.ok(event);
  assert.equal(event.price, 9_500);
  assert.equal(event.previousPrice, 8_000);
});

test('a first-ever reading has no previous price to compare against', () => {
  const event = catchUpFrom([], [server(1, 5_000)]);

  assert.ok(event, 'the product still needs its lastPrice set');
  assert.equal(event.previousPrice, null, 'null is what stops the caller alerting on it');
});

test('an unchanged history yields nothing', () => {
  const before = [browser(5, 7_000)];

  assert.equal(catchUpFrom(before, before), null);
});

test('a merge whose newest point is still the browser yields nothing', () => {
  // mergeHistory sorts by timestamp, so a stale server row lands behind a fresh
  // browser one. The browser is the source of truth; it already won.
  const before = [browser(1, 7_000)];
  const after = [server(6, 7_400), browser(1, 7_000)];

  assert.equal(catchUpFrom(before, after), null);
});

test('an empty merge result is handled rather than thrown on', () => {
  assert.equal(catchUpFrom([], []), null);
});
