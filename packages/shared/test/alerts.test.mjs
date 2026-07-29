import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateAlert } from '../src/alerts.js';
import { summarizeHistory } from '../src/history.js';

const quiet = { notifyOnAnyDrop: false, minDropPercentToNotify: 0 };
const stats = { median90: 10000, min: 8000, max: 14000, current: 9000, first: 12000, points: 20 };

test('absolute target fires at or below the threshold', () => {
  const target = { type: 'absolute', value: 5000 };
  assert.equal(evaluateAlert({ target, stats, price: 5000, settings: quiet }).fire, true);
  assert.equal(evaluateAlert({ target, stats, price: 4999, settings: quiet }).fire, true);
  assert.equal(evaluateAlert({ target, stats, price: 5001, settings: quiet }).fire, false);
});

test('median target fires only at or below the 90-day median', () => {
  const target = { type: 'median' };
  assert.equal(evaluateAlert({ target, stats, price: 10000, settings: quiet }).fire, true);
  assert.equal(evaluateAlert({ target, stats, price: 10001, settings: quiet }).fire, false);
});

test('percent target is measured against the median, not the previous price', () => {
  const target = { type: 'percent', value: 20 }; // 20% below a 10000 median => 8000
  assert.equal(evaluateAlert({ target, stats, price: 8000, settings: quiet }).fire, true);
  assert.equal(evaluateAlert({ target, stats, price: 8100, settings: quiet }).fire, false);
});

test('a fake sale off an inflated price does not fire a percent alert', () => {
  // Retailer holds ~10000 for months, spikes to 20000, then "discounts" to 12000.
  const history = [
    { ts: 1, lastSeen: 1, price: 10000, inStock: true },
    { ts: 2, lastSeen: 2, price: 10000, inStock: true },
    { ts: 3, lastSeen: 3, price: 20000, inStock: true },
  ];
  const realStats = summarizeHistory(history);
  const target = { type: 'percent', value: 30 };

  // A 40% cut off the spiked price is still above what it normally costs.
  const verdict = evaluateAlert({
    target,
    stats: realStats,
    previousPrice: 20000,
    price: 12000,
    settings: quiet,
  });

  assert.equal(verdict.fire, false, 'should not celebrate a discount off an inflated price');
});

test('any-drop rule respects the minimum percentage', () => {
  const settings = { notifyOnAnyDrop: true, minDropPercentToNotify: 5 };
  assert.equal(evaluateAlert({ stats, previousPrice: 1000, price: 950, settings }).fire, true);
  assert.equal(evaluateAlert({ stats, previousPrice: 1000, price: 960, settings }).fire, false);
});

test('a price increase never fires an alert', () => {
  const settings = { notifyOnAnyDrop: true, minDropPercentToNotify: 0 };
  assert.equal(evaluateAlert({ stats, previousPrice: 1000, price: 1200, settings }).fire, false);
});

test('targets still fire when the any-drop rule is disabled', () => {
  const verdict = evaluateAlert({
    target: { type: 'absolute', value: 900 },
    stats,
    previousPrice: 1000,
    price: 880,
    settings: quiet,
  });
  assert.equal(verdict.fire, true);
  assert.equal(verdict.kind, 'target');
});

test('rules needing history stay silent when there is none', () => {
  for (const target of [{ type: 'median' }, { type: 'percent', value: 20 }]) {
    assert.equal(evaluateAlert({ target, stats: null, price: 1, settings: quiet }).fire, false);
  }
});

test('a malformed target does not throw or fire', () => {
  for (const target of [{ type: 'absolute' }, { type: 'percent' }, { type: 'nonsense', value: 5 }, {}]) {
    assert.equal(evaluateAlert({ target, stats, price: 1, settings: quiet }).fire, false);
  }
});
