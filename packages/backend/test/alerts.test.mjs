/**
 * When a server-observed drop is allowed to become an email.
 *
 * Every rule here exists to stop a specific bad email, and the failure modes are
 * asymmetric: a missed alert is a disappointment, a wrong one lands in someone's
 * inbox and cannot be taken back. The cases below are the ones that would
 * otherwise send.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALERT_COOLDOWN_MS,
  DEVICE_AWAY_MS,
  MIN_POINTS_FOR_EMAIL,
  composeAlertEmail,
  shouldEmail,
} from '../src/checker/alerts.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A device that has not synced in days — the browser really is away. */
const AWAY = NOW - 3 * DAY;

const product = (extra = {}) => ({
  id: 'p1',
  device_id: 'd1',
  title: 'Kindle Paperwhite',
  currency: 'INR',
  url: 'https://www.amazon.in/dp/B08N36XNTT',
  canonical_url: 'https://www.amazon.in/dp/B08N36XNTT',
  last_alert_price: null,
  last_alert_at: 0,
  ...extra,
});

/**
 * A steady series around `base`, oldest first, with `final` appended as the
 * reading just taken. Long enough to clear MIN_POINTS_FOR_EMAIL.
 */
function series(base, final, count = 8) {
  const points = [];
  for (let i = count; i > 0; i -= 1) {
    points.push({ ts: NOW - i * DAY, lastSeen: NOW - i * DAY, price: base, inStock: true });
  }
  points.push({ ts: NOW, lastSeen: NOW, price: final, inStock: true });
  return points;
}

test('a real drop on an away device sends', () => {
  const decision = shouldEmail({
    product: product(),
    history: series(10_000, 8_000),
    price: 8_000,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, true);
  assert.equal(decision.previousPrice, 10_000);
  assert.ok(decision.verdict.fire);
});

test('an active device is left to the extension', () => {
  // The browser synced an hour ago, so it is running and will raise its own
  // notification. Emailing as well is two alerts for one price drop.
  const decision = shouldEmail({
    product: product(),
    history: series(10_000, 8_000),
    price: 8_000,
    deviceLastSeen: NOW - HOUR,
    now: NOW,
  });

  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'device-active');
});

test('a device just past the away threshold is emailable', () => {
  const decision = shouldEmail({
    product: product(),
    history: series(10_000, 8_000),
    price: 8_000,
    deviceLastSeen: NOW - DEVICE_AWAY_MS - 1,
    now: NOW,
  });

  assert.equal(decision.send, true);
});

test('thin server history does not get to decide what is a bargain', () => {
  // The browser never uploads its history, so this median is built from server
  // readings alone. Three points is not a 90-day median.
  const thin = series(10_000, 8_000, MIN_POINTS_FOR_EMAIL - 3);

  const decision = shouldEmail({
    product: product(),
    history: thin,
    price: 8_000,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'thin-history');
});

test('a drop under the server threshold does not send', () => {
  // 4% — under the server's deliberately stricter 10%, though the extension's
  // own 5% default would have fired. Email is more intrusive and is being
  // decided on thinner data.
  const decision = shouldEmail({
    product: product(),
    history: series(10_000, 9_600),
    price: 9_600,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'no-alert');
});

test('the same price does not send twice', () => {
  // Without this the cron re-sends every 30 minutes for as long as the price
  // stays low.
  const decision = shouldEmail({
    product: product({ last_alert_price: 8_000, last_alert_at: NOW - 5 * DAY }),
    history: series(10_000, 8_000),
    price: 8_000,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'already-alerted');
});

test('a partial recovery does not send', () => {
  const decision = shouldEmail({
    product: product({ last_alert_price: 8_000, last_alert_at: NOW - 5 * DAY }),
    history: series(10_000, 8_500),
    price: 8_500,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'already-alerted');
});

test('a further drop sends again once the cooldown has passed', () => {
  const decision = shouldEmail({
    product: product({ last_alert_price: 8_000, last_alert_at: NOW - 5 * DAY }),
    history: series(10_000, 6_500),
    price: 6_500,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, true);
});

test('a further drop inside the cooldown waits', () => {
  // A price oscillating around a threshold would otherwise mail on every
  // crossing.
  const decision = shouldEmail({
    product: product({ last_alert_price: 8_000, last_alert_at: NOW - ALERT_COOLDOWN_MS + HOUR }),
    history: series(10_000, 6_500),
    price: 6_500,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, false);
  assert.equal(decision.reason, 'cooldown');
});

test('a product with no earlier reading has nothing to compare against', () => {
  const decision = shouldEmail({
    product: product(),
    history: [{ ts: NOW, lastSeen: NOW, price: 8_000, inStock: true }],
    price: 8_000,
    deviceLastSeen: AWAY,
    now: NOW,
  });

  assert.equal(decision.send, false);
});

test('a device that has never synced is treated as away, not as active', () => {
  // last_seen_at of 0 must not read as "seen at the epoch, therefore recent".
  const decision = shouldEmail({
    product: product(),
    history: series(10_000, 8_000),
    price: 8_000,
    deviceLastSeen: 0,
    now: NOW,
  });

  assert.equal(decision.send, true);
});

test('the email states the change and escapes the product title', () => {
  const message = composeAlertEmail({
    product: product({ title: 'Kindle <script>alert(1)</script>' }),
    price: 8_000,
    previousPrice: 10_000,
    verdict: { fire: true, kind: 'drop', label: 'Price dropped 20%' },
  });

  assert.match(message.subject, /8,000/);
  assert.match(message.text, /10,000 → ₹8,000/);
  assert.ok(!message.html.includes('<script>'), 'title must not be injectable into the HTML body');
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.text, /turn off email alerts/, 'must say how to stop receiving these');
});
