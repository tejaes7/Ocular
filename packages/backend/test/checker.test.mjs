import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  selectBatch,
  backoffFor,
  checkOne,
  failureReasonFromResponse,
} from '../src/checker/cron.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeProduct(id, hostname = 'amazon.in') {
  return {
    id,
    hostname,
  };
}

test('failureReasonFromResponse classifies 404 correctly', () => {
  assert.equal(failureReasonFromResponse(404), 'gone');
});

test('failureReasonFromResponse classifies 403 correctly', () => {
  assert.equal(failureReasonFromResponse(403), 'forbidden');
});

test('failureReasonFromResponse classifies 429 correctly', () => {
  assert.equal(failureReasonFromResponse(429), 'rate-limited');
});

test('failureReasonFromResponse classifies server errors', () => {
  assert.equal(failureReasonFromResponse(500), 'server-error');
  assert.equal(failureReasonFromResponse(503), 'server-error');
});

test('failureReasonFromResponse defaults to blocked', () => {
  assert.equal(failureReasonFromResponse(401), 'blocked');
  assert.equal(failureReasonFromResponse(418), 'blocked');
});

test('backoffFor returns 1 hour after first failure', () => {
  assert.equal(backoffFor(1), HOUR);
});

test('backoffFor returns 6 hours after second failure', () => {
  assert.equal(backoffFor(2), 6 * HOUR);
});

test('backoffFor returns 1 day after third failure', () => {
  assert.equal(backoffFor(3), DAY);
});

test('backoffFor returns 3 days after fourth failure', () => {
  assert.equal(backoffFor(4), 3 * DAY);
});

test('backoffFor stays at 3 days after many failures', () => {
  assert.equal(backoffFor(100), 3 * DAY);
});

test('selectBatch returns empty array when no products exist', () => {
  assert.deepEqual(selectBatch([]), []);
});

test('selectBatch limits each host to four products', () => {
  const products = [];

  for (let i = 1; i <= 10; i++) {
    products.push(makeProduct(i, 'amazon.in'));
  }

  const batch = selectBatch(products);

  assert.equal(batch.length, 4);
});

test('selectBatch allows four products from each host', () => {
  const products = [];

  for (let i = 1; i <= 6; i++) {
    products.push(makeProduct(`a${i}`, 'amazon.in'));
  }

  for (let i = 1; i <= 6; i++) {
    products.push(makeProduct(`f${i}`, 'flipkart.com'));
  }

  const batch = selectBatch(products);

  const amazon = batch.filter(p => p.hostname === 'amazon.in');
  const flipkart = batch.filter(p => p.hostname === 'flipkart.com');

  assert.equal(amazon.length, 4);
  assert.equal(flipkart.length, 4);
});

test('selectBatch never returns more than forty products', () => {
  const products = [];

  for (let i = 0; i < 100; i++) {
    products.push(makeProduct(i, `host${i}.com`));
  }

  const batch = selectBatch(products);

  assert.equal(batch.length, 40);
});

// A D1 stub that records every statement it is asked to run, so a test can assert
// on what checkOne actually wrote rather than on what it returned (it returns
// nothing). This is what catches a silently dropped write.
function makeEnv() {
  const statements = [];
  const bind = sql => ({ bind: (...args) => ({ sql, args, run: async () => ({}) }) });

  return {
    statements,
    DB: {
      prepare(sql) {
        const stmt = bind(sql);
        return {
          bind: (...args) => {
            const bound = stmt.bind(...args);
            statements.push(bound);
            return bound;
          },
        };
      },
      batch: async stmts => stmts,
    },
  };
}

const WATCHED = {
  id: 'p1',
  device_id: 'd1',
  url: 'https://www.amazon.in/dp/X',
  canonical_url: 'https://www.amazon.in/dp/X',
  hostname: 'amazon.in',
  fail_count: 0,
};

const PRICED_HTML = `<html><head>
  <meta property="og:title" content="Test Product">
  <meta property="product:price:amount" content="349.00">
  <meta property="product:price:currency" content="inr">
</head><body></body></html>`;

test('a successful check writes the price row and clears the failure state', async () => {
  const env = makeEnv();

  await checkOne(env, WATCHED, async () => ({
    ok: true,
    status: 200,
    text: async () => PRICED_HTML,
  }));

  const inserted = env.statements.find(s => /INSERT OR IGNORE INTO prices/.test(s.sql));
  assert.ok(inserted, 'a successful check must insert into prices');
  assert.ok(inserted.args.includes(349), 'the scanned price must reach the prices row');

  const updated = env.statements.find(s => /UPDATE products SET fail_count = 0/.test(s.sql));
  assert.ok(updated, 'a successful check must reset fail_count and advance last_checked_at');
});

test('a failed check records the failure and writes no price', async () => {
  const env = makeEnv();

  await checkOne(env, WATCHED, async () => ({ ok: false, status: 403 }));

  assert.ok(
    !env.statements.some(s => /INSERT OR IGNORE INTO prices/.test(s.sql)),
    'a failed check must not write a price'
  );

  const failed = env.statements.find(s => /UPDATE products SET fail_count = \?/.test(s.sql));
  assert.ok(failed, 'a failed check must record the failure');
  assert.ok(failed.args.includes('forbidden'), 'the classified reason must be stored');
});