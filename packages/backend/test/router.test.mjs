/**
 * Router and auth tests for the sync worker.
 *
 * These run under plain `node --test` with a hand-rolled D1 stub rather than
 * miniflare — the fetch handler takes a standard `Request` and returns a
 * standard `Response`, so there is nothing Cloudflare-specific to emulate at
 * this layer. Fast tests here mean the auth boundary can't regress silently.
 *
 * Cron behaviour (`scheduled`) makes real network calls and is deliberately not
 * covered here; test that against `wrangler dev` with a local D1.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker from '../src/index.js';

const VALID_TOKEN = '3f1c9e2a-5b7d-4e8f-9a1b-2c3d4e5f6a7b';

/**
 * Minimal D1 double. `results` is consulted in order for each `.all()` call, so
 * a test can script what the database appears to contain.
 */
function stubDb(results = []) {
  const queue = [...results];
  const calls = [];

  const statement = (sql) => ({
    sql,
    bind(...args) {
      calls.push({ sql, args });
      return {
        run: async () => ({ success: true }),
        all: async () => queue.shift() ?? { results: [] },
        first: async () => null,
      };
    },
    run: async () => ({ success: true }),
    all: async () => queue.shift() ?? { results: [] },
    // Real D1 statements expose first() without bind(); /health relies on it.
    first: async () => ({ 1: 1 }),
  });

  return {
    calls,
    DB: {
      prepare: statement,
      batch: async (statements) => statements.map(() => ({ success: true })),
    },
  };
}

const post = (body, headers = {}) =>
  new Request('https://ocular.test/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const authed = (body) => post(body, { Authorization: `Bearer ${VALID_TOKEN}` });

// ---------------------------------------------------------------------------

test('GET /health reports service liveness', async () => {
  const response = await worker.fetch(new Request('https://ocular.test/health'), stubDb());
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'ocular-sync');
  assert.equal(body.status, 'healthy');
  assert.equal(body.db, 'connected');
});

test('GET /health reports 503 when the database is unreachable', async () => {
  // The failure this exists to catch: a wrong database_id or an unapplied
  // migration leaves the worker running and every route 500ing. A health check
  // that only proves the script is alive would report healthy throughout.
  const brokenDb = {
    DB: {
      prepare() {
        return {
          first: async () => {
            throw new Error('D1_ERROR: no such table');
          },
        };
      },
    },
  };

  const response = await worker.fetch(new Request('https://ocular.test/health'), brokenDb);

  assert.equal(response.status, 503);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.status, 'degraded');
  assert.equal(body.db, 'unavailable');
});

test('error responses carry a stable machine-readable code', async () => {
  // The frontend branches on `code`; `error` is display text and free to reword.
  const notFound = await worker.fetch(new Request('https://ocular.test/nope'), stubDb());
  assert.equal((await notFound.json()).code, 'NOT_FOUND');

  const noToken = await worker.fetch(post({ products: [] }), stubDb());
  assert.equal((await noToken.json()).code, 'UNAUTHORIZED');

  const badBody = await worker.fetch(
    post('{not json', { Authorization: `Bearer ${VALID_TOKEN}` }),
    stubDb()
  );
  assert.equal((await badBody.json()).code, 'BAD_REQUEST');
});

test('OPTIONS preflight is answered with CORS headers', async () => {
  const response = await worker.fetch(
    new Request('https://ocular.test/sync', { method: 'OPTIONS' }),
    stubDb()
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('unknown routes 404 rather than falling through', async () => {
  const response = await worker.fetch(new Request('https://ocular.test/admin'), stubDb());
  assert.equal(response.status, 404);
});

test('GET /sync is not accepted — sync must be a POST', async () => {
  const response = await worker.fetch(new Request('https://ocular.test/sync'), stubDb());
  assert.equal(response.status, 404);
});

// --- auth ------------------------------------------------------------------

test('POST /sync without a token is rejected', async () => {
  const response = await worker.fetch(post({ products: [] }), stubDb());
  assert.equal(response.status, 401);
});

test('POST /sync rejects tokens that are not UUIDs', async () => {
  // Guards against someone passing a guessable or injected identifier.
  for (const token of ['admin', '1', "' OR 1=1 --", 'Bearer', 'x'.repeat(64)]) {
    const response = await worker.fetch(
      post({ products: [] }, { Authorization: `Bearer ${token}` }),
      stubDb()
    );
    assert.equal(response.status, 401, `should reject token: ${token}`);
  }
});

test('POST /sync accepts a well-formed UUID regardless of case', async () => {
  const env = stubDb();
  const response = await worker.fetch(
    post({ products: [] }, { Authorization: `Bearer ${VALID_TOKEN.toUpperCase()}` }),
    env
  );
  assert.equal(response.status, 200);
});

// --- body handling ---------------------------------------------------------

test('POST /sync rejects a malformed body', async () => {
  const response = await worker.fetch(
    post('{not json', { Authorization: `Bearer ${VALID_TOKEN}` }),
    stubDb()
  );
  assert.equal(response.status, 400);
});

test('POST /sync tolerates a missing products array', async () => {
  const response = await worker.fetch(authed({}), stubDb());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tracking, 0);
});

test('POST /sync skips products with no canonical URL', async () => {
  const env = stubDb();
  const response = await worker.fetch(
    authed({
      products: [
        { id: 'good', canonicalUrl: 'https://www.amazon.in/dp/B01', url: 'https://www.amazon.in/dp/B01' },
        { id: 'no-url' },
        { id: 'bad-url', canonicalUrl: 'not a url' },
      ],
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).tracking, 1, 'only the valid product is tracked');
});

test('POST /sync returns server-observed prices grouped by product', async () => {
  const env = stubDb([
    { results: [] }, // SELECT id FROM products  (nothing stale to delete)
    {
      results: [
        { product_id: 'p1', ts: 1000, price: 4499, in_stock: 1 },
        { product_id: 'p1', ts: 2000, price: 4299, in_stock: 1 },
        { product_id: 'p2', ts: 1500, price: 999, in_stock: 0 },
      ],
    },
  ]);

  const response = await worker.fetch(authed({ products: [], since: 0 }), env);
  const body = await response.json();

  assert.equal(body.ok, true);
  assert.equal(body.prices.p1.length, 2);
  assert.deepEqual(body.prices.p1[0], { ts: 1000, price: 4499, inStock: true, source: 'server' });
  assert.equal(body.prices.p2[0].inStock, false, 'in_stock 0 maps to false');
});

test('every response carries CORS headers so the extension can read it', async () => {
  const response = await worker.fetch(authed({ products: [] }), stubDb());
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Content-Type'), /application\/json/);
});
