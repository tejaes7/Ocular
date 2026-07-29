import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPlausibleReading, mergeHistory, summarizeHistory } from '../src/history.js';

const point = (ts, price, extra = {}) => ({ ts, lastSeen: ts, price, inStock: true, ...extra });

test('mergeHistory unions and orders by timestamp', () => {
  const merged = mergeHistory([point(300, 90)], [point(100, 110), point(200, 100)]);
  assert.deepEqual(
    merged.map((p) => [p.ts, p.price]),
    [[100, 110], [200, 100], [300, 90]]
  );
});

test('mergeHistory collapses consecutive identical prices', () => {
  const merged = mergeHistory(
    [point(100, 500), point(200, 500)],
    [point(150, 500), point(300, 450)]
  );
  assert.equal(merged.length, 2);
  assert.deepEqual([merged[0].price, merged[1].price], [500, 450]);
  assert.equal(merged[0].lastSeen, 200, 'collapsed point keeps the latest sighting');
});

test('mergeHistory is idempotent — re-importing the same data adds nothing', () => {
  const history = [point(100, 500), point(200, 450), point(300, 480)];
  const once = mergeHistory([], history);
  const twice = mergeHistory(once, history);
  assert.deepEqual(twice, once);
});

test('mergeHistory drops malformed points instead of corrupting the series', () => {
  const merged = mergeHistory(
    [point(100, 500)],
    [null, undefined, { ts: 'x', price: 5 }, { ts: 200 }, point(300, 400)]
  );
  assert.deepEqual(merged.map((p) => p.price), [500, 400]);
});

test('mergeHistory tags imported points that carry no source', () => {
  const merged = mergeHistory([], [{ ts: 1, price: 100 }]);
  assert.equal(merged[0].source, 'import');
  assert.equal(merged[0].lastSeen, 1);
});

test('summarizeHistory reports low, high, first and current', () => {
  const history = [900, 1200, 1000, 1100].map((price, i) => ({
    ts: i,
    lastSeen: Date.now(),
    price,
    inStock: true,
  }));
  const result = summarizeHistory(history);

  assert.equal(result.min, 900);
  assert.equal(result.max, 1200);
  assert.equal(result.first, 900);
  assert.equal(result.current, 1100);
  assert.equal(result.points, 4);
});

test('summarizeHistory falls back to the full series when the 90-day window is empty', () => {
  const ancient = Date.now() - 400 * 24 * 60 * 60 * 1000;
  const result = summarizeHistory([
    { ts: ancient, lastSeen: ancient, price: 800, inStock: true },
    { ts: ancient + 1, lastSeen: ancient + 1, price: 1000, inStock: true },
  ]);
  // A dormant product must still report a usable "usual price", not null.
  assert.ok(Number.isFinite(result.median90));
});

test('summarizeHistory returns null for an empty history', () => {
  assert.equal(summarizeHistory([]), null);
  assert.equal(summarizeHistory(null), null);
  assert.equal(summarizeHistory(undefined), null);
});

// ---------------------------------------------------------------------------
// isPlausibleReading
//
// Cover for the ₹94.75 incident: a pack-of-4 priced at ₹349 was stored as
// ₹94.75 (its per-unit price) and then ₹8.75, both from the guessing rung on an
// unrendered document. Nothing stood between a guessed price and permanent
// storage, so the median moved and a false "price dropped 73%" alert fired.
// ---------------------------------------------------------------------------

const usual = { median90: 349, min: 349, max: 379, current: 349, first: 349, points: 12 };

test('a guessed reading far below the usual price is rejected', () => {
  const verdict = isPlausibleReading({
    price: 94.75,
    strategy: 'heuristic-blind',
    confidence: 'low',
    stats: usual,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'implausible-drop');
});

test('a structured reading far below the usual price is accepted', () => {
  // Real crashes happen. A retailer-published price is not second-guessed.
  const verdict = isPlausibleReading({
    price: 94.75,
    strategy: 'jsonld',
    confidence: 'high',
    stats: usual,
  });
  assert.equal(verdict.ok, true);
});

test('a structured reading is still distrusted when it reports low confidence', () => {
  const verdict = isPlausibleReading({
    price: 8.75,
    strategy: 'selector',
    confidence: 'low',
    stats: usual,
  });
  assert.equal(verdict.ok, false);
});

test('a guessed reading close to the usual price is accepted', () => {
  const verdict = isPlausibleReading({
    price: 320,
    strategy: 'heuristic',
    confidence: 'medium',
    stats: usual,
  });
  assert.equal(verdict.ok, true);
});

test('the first reading for a product is always accepted', () => {
  // No baseline exists yet, so there is nothing to be implausible against.
  const verdict = isPlausibleReading({
    price: 94.75,
    strategy: 'heuristic-blind',
    confidence: 'low',
    stats: null,
  });
  assert.equal(verdict.ok, true);
});

test('zero and negative prices are rejected outright', () => {
  for (const price of [0, -5, Number.NaN, Infinity]) {
    const verdict = isPlausibleReading({ price, strategy: 'jsonld', stats: usual });
    assert.equal(verdict.ok, false, `accepted ${price}`);
    assert.equal(verdict.reason, 'invalid-price');
  }
});

test('an implausible spike upward is rejected too', () => {
  const verdict = isPlausibleReading({
    price: 40_000,
    strategy: 'heuristic',
    confidence: 'medium',
    stats: usual,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'implausible-rise');
});
