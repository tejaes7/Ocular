/**
 * The gate on server-sent price readings.
 *
 * Server rows used to be merged into local history after nothing more than a
 * `price > 0` check. That had the trust model backwards: the worker reads from
 * a Cloudflare datacenter IP, so it is the side more likely to be served an
 * anti-bot placeholder, a regional price, or a stale page — the header of
 * sync.js says exactly that. A junk point merged here is permanent, drags the
 * 90-day median down, and fires a false "lowest ever".
 *
 * `mergeHistory` is not a defence against it. It only stops a server point
 * overwriting a browser one; a bad point landing in an empty slot overwrites
 * nothing and is kept.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acceptableServerPoints } from '../src/lib/sync.js';

const DAY = 86_400_000;

/** History sitting steadily around ₹10,000, which sets median90. */
const steadyStats = { median90: 10_000, min: 9_500, max: 10_500, points: 12, current: 10_000 };

const at = (daysAgo, price, extra = {}) => ({
  ts: Date.now() - daysAgo * DAY,
  price,
  inStock: true,
  ...extra,
});

test('a plausible server reading is accepted and tagged as server-sourced', () => {
  const { accepted, rejected } = acceptableServerPoints([at(1, 9_400)], steadyStats);

  assert.equal(rejected, 0);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].price, 9_400);
  assert.equal(accepted[0].source, 'server', 'provenance must survive the gate');
  assert.equal(accepted[0].lastSeen, accepted[0].ts, 'lastSeen seeds from ts for mergeHistory');
});

test('an implausibly cheap server reading is rejected', () => {
  // The real-world shape: a per-unit price or an anti-bot placeholder arriving
  // as a fraction of the true price. Merged, it would become the new "lowest
  // ever" and drag the median with it.
  const { accepted, rejected } = acceptableServerPoints([at(1, 94.75)], steadyStats);

  assert.equal(accepted.length, 0, 'must not enter history');
  assert.equal(rejected, 1);
});

test('an implausibly expensive server reading is rejected', () => {
  const { accepted, rejected } = acceptableServerPoints([at(1, 90_000)], steadyStats);

  assert.equal(accepted.length, 0);
  assert.equal(rejected, 1);
});

test('malformed rows are dropped without throwing', () => {
  const { accepted, rejected } = acceptableServerPoints(
    [
      { ts: Date.now(), price: 0 },
      { ts: Date.now(), price: -5 },
      { ts: Date.now(), price: Number.NaN },
      { ts: 'not-a-number', price: 9_900 },
      { price: 9_900 },
      null,
      undefined,
    ],
    steadyStats
  );

  assert.equal(accepted.length, 0);
  assert.equal(rejected, 7);
});

test('a product with no local history accepts the first server reading', () => {
  // Nothing to contradict it, and refusing would leave the series empty
  // forever — a device that never opens the page would never get a price.
  const { accepted, rejected } = acceptableServerPoints([at(1, 4_499)], null);

  assert.equal(rejected, 0);
  assert.equal(accepted.length, 1);
});

test('a mixed batch keeps the good rows and drops only the bad', () => {
  const { accepted, rejected } = acceptableServerPoints(
    [at(3, 9_900), at(2, 12), at(1, 9_750)],
    steadyStats
  );

  assert.deepEqual(
    accepted.map((point) => point.price),
    [9_900, 9_750],
    'one bad reading must not discard the whole sync'
  );
  assert.equal(rejected, 1);
});

test('a non-array payload is handled rather than thrown on', () => {
  for (const payload of [null, undefined, {}, 'nope']) {
    const { accepted, rejected } = acceptableServerPoints(payload, steadyStats);
    assert.equal(accepted.length, 0);
    assert.equal(rejected, 0);
  }
});
