import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  selectBatch,
  backoffFor,
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