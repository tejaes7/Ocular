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
import { beforeEach, test } from 'node:test';

import worker from '../src/index.js';
import { resetRateLimits } from '../src/lib/ratelimit.js';

// The limiter keeps counters in module scope, so without this the tests would
// share one bucket and start failing purely because of how many ran before them.
beforeEach(() => resetRateLimits());

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

  const response = await worker.fetch(authed({ products: [], since: 0, complete: true }), env);
  const body = await response.json();

  assert.equal(body.ok, true);
  assert.equal(body.prices.p1.length, 2);
  assert.deepEqual(body.prices.p1[0], { ts: 1000, price: 4499, inStock: true, source: 'server' });
  assert.equal(body.prices.p2[0].inStock, false, 'in_stock 0 maps to false');
  assert.equal(body.truncated, false);
  assert.ok(Number.isFinite(body.nextSince));
});

// ---------------------------------------------------------------------------
// The watchlist cap: refuse, never truncate
// ---------------------------------------------------------------------------

const productAt = (i) => ({
  id: `p${i}`,
  canonicalUrl: `https://shop.example.com/p/${i}`,
});

test('POST /sync refuses an over-cap watchlist instead of deleting the excess', async () => {
  const env = stubDb();
  const products = Array.from({ length: 250 }, (_, i) => productAt(i));

  const response = await worker.fetch(authed({ products, since: 0, complete: true }), env);
  assert.equal(response.status, 413);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'TOO_MANY_PRODUCTS');

  // The real defect was never the rejection — it was that the overflow got
  // deleted. Nothing may touch the database on this path.
  const wrote = env.calls.some((call) => /INSERT|DELETE|UPDATE/i.test(call.sql));
  assert.equal(wrote, false, 'an over-cap sync must not write or delete anything');
});

test('POST /sync accepts a watchlist exactly at the cap', async () => {
  const env = stubDb();
  const products = Array.from({ length: 200 }, (_, i) => productAt(i));

  const response = await worker.fetch(authed({ products, since: 0, complete: true }), env);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.tracking, 200);
});

test('POST /sync only reconciles deletions when told the payload is complete', async () => {
  // The server believes the device tracks p1 and p2; the payload mentions
  // neither, but does not claim to be the whole list.
  const partial = stubDb([{ results: [{ id: 'p1' }, { id: 'p2' }] }]);
  await worker.fetch(authed({ products: [], since: 0 }), partial);

  assert.equal(
    partial.calls.some((call) => /DELETE FROM products/i.test(call.sql)),
    false,
    'a payload that does not claim completeness must never delete'
  );

  // The same request, asserting completeness, is the legitimate "I removed
  // everything" case and must still work.
  const complete = stubDb([{ results: [{ id: 'p1' }, { id: 'p2' }] }]);
  await worker.fetch(authed({ products: [], since: 0, complete: true }), complete);

  assert.ok(
    complete.calls.some((call) => /DELETE FROM products/i.test(call.sql)),
    'a complete payload still reconciles removals'
  );
});

// ---------------------------------------------------------------------------
// Price paging
// ---------------------------------------------------------------------------

test('a truncated price page returns a resumable cursor, not the clock', async () => {
  // 5001 rows: one more than the cap, which is what tells the route there is
  // more waiting. Timestamps are distinct so no trailing group is dropped.
  const rows = Array.from({ length: 5001 }, (_, i) => ({
    product_id: 'p1',
    ts: 1000 + i,
    price: 500,
    in_stock: 1,
  }));

  const env = stubDb([{ results: [] }, { results: rows }]);
  const response = await worker.fetch(authed({ products: [], since: 0, complete: true }), env);
  const body = await response.json();

  assert.equal(body.truncated, true);
  assert.equal(body.prices.p1.length, 5000, 'the over-fetched probe row is not sent');

  // The cursor must be the last row actually delivered. Advancing to serverTime
  // — the old behaviour — is what skipped everything past row 5000 forever.
  assert.equal(body.nextSince, 1000 + 4999);
  assert.ok(body.nextSince < body.serverTime);
});

test('a truncated page never splits a group of equal timestamps', async () => {
  // The last 10 rows share one timestamp. Resuming at that timestamp with a
  // `ts > since` filter would skip its siblings, so the whole group is held back.
  const rows = Array.from({ length: 5001 }, (_, i) => ({
    product_id: 'p1',
    ts: i >= 4991 ? 9999 : 1000 + i,
    price: 500,
    in_stock: 1,
  }));

  const env = stubDb([{ results: [] }, { results: rows }]);
  const response = await worker.fetch(authed({ products: [], since: 0, complete: true }), env);
  const body = await response.json();

  assert.equal(body.truncated, true);
  assert.equal(body.nextSince, 1000 + 4990, 'cursor stops before the shared-timestamp group');
  assert.equal(body.prices.p1.length, 4991);
});

test('a complete price page advances the cursor to now', async () => {
  const env = stubDb([
    { results: [] },
    { results: [{ product_id: 'p1', ts: 1000, price: 500, in_stock: 1 }] },
  ]);

  const response = await worker.fetch(authed({ products: [], since: 0, complete: true }), env);
  const body = await response.json();

  assert.equal(body.truncated, false);
  assert.equal(body.nextSince, body.serverTime);
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

test('POST /sync throttles a caller that will not stop', async () => {
  const env = stubDb();

  // The budget is 60/minute; the 61st is the first that must be refused.
  for (let i = 0; i < 60; i += 1) {
    const ok = await worker.fetch(authed({ products: [] }), env);
    assert.equal(ok.status, 200, `request ${i + 1} should still be allowed`);
  }

  const response = await worker.fetch(authed({ products: [] }), env);
  assert.equal(response.status, 429);

  const body = await response.json();
  assert.equal(body.code, 'RATE_LIMITED');
  assert.ok(Number(response.headers.get('Retry-After')) > 0, 'Retry-After makes 429 actionable');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('GET /health is never throttled', async () => {
  const env = stubDb();

  for (let i = 0; i < 200; i += 1) {
    const response = await worker.fetch(new Request('https://ocular.test/health'), env);
    assert.equal(response.status, 200, 'an uptime probe must not be rate limited');
  }
});

test('every response carries CORS headers so the extension can read it', async () => {
  const response = await worker.fetch(authed({ products: [] }), stubDb());
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Content-Type'), /application\/json/);
});
