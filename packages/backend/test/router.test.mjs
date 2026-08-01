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
        first: async () => (sql.includes('SELECT 1') ? { alive: 1 } : null),
      };
    },
    run: async () => ({ success: true }),
    all: async () => queue.shift() ?? { results: [] },
    first: async () => (sql.includes('SELECT 1') ? { alive: 1 } : null),
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

test('GET /health reports service liveness and database connection', async () => {
  const response = await worker.fetch(new Request('https://ocular.test/health'), stubDb());
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'ocular-sync');
  assert.equal(body.status, 'healthy');
  assert.equal(body.db, 'connected');
});

test('GET /health returns HTTP 503 degraded status when DB fails', async () => {
  const brokenDb = {
    DB: {
      prepare: () => ({
        first: async () => {
          throw new Error('D1 connection lost');
        },
      }),
    },
  };
  const response = await worker.fetch(new Request('https://ocular.test/health'), brokenDb);
  assert.equal(response.status, 503);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.status, 'degraded');
  assert.equal(body.db, 'disconnected');
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

test('POST /sync rejects non-object JSON bodies', async () => {
  for (const invalidBody of ['"just a string"', '123', 'true', '["array"]']) {
    const response = await worker.fetch(
      post(invalidBody, { Authorization: `Bearer ${VALID_TOKEN}` }),
      stubDb()
    );
    assert.equal(response.status, 400, `should reject body: ${invalidBody}`);
    const resJson = await response.json();
    assert.equal(resJson.ok, false);
    assert.match(resJson.error, /JSON object/i);
  }
});

test('POST /sync rejects invalid since timestamp', async () => {
  for (const badSince of [-1, '123', Infinity, NaN]) {
    const response = await worker.fetch(authed({ since: badSince }), stubDb());
    assert.equal(response.status, 400);
    const resJson = await response.json();
    assert.equal(resJson.ok, false);
    assert.match(resJson.error, /since/i);
  }
});

test('POST /sync rejects non-array products property', async () => {
  const response = await worker.fetch(authed({ products: 'not-an-array' }), stubDb());
  assert.equal(response.status, 400);
  const resJson = await response.json();
  assert.equal(resJson.ok, false);
  assert.match(resJson.error, /array/i);
});

test('POST /sync rejects products payload exceeding size limit', async () => {
  const oversizedProducts = Array.from({ length: 201 }, (_, i) => ({
    id: `p_${i}`,
    canonicalUrl: `https://example.com/p/${i}`,
  }));
  const response = await worker.fetch(authed({ products: oversizedProducts }), stubDb());
  assert.equal(response.status, 400);
  const resJson = await response.json();
  assert.equal(resJson.ok, false);
  assert.match(resJson.error, /maximum allowed size/i);
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

// --- error handling & codes -----------------------------------------------

test('error responses return structured error code identifiers', async () => {
  const unauthRes = await worker.fetch(post({ products: [] }), stubDb());
  const unauthJson = await unauthRes.json();
  assert.equal(unauthJson.ok, false);
  assert.equal(unauthJson.code, 'UNAUTHORIZED');

  const notFoundRes = await worker.fetch(new Request('https://ocular.test/invalid'), stubDb());
  const notFoundJson = await notFoundRes.json();
  assert.equal(notFoundJson.ok, false);
  assert.equal(notFoundJson.code, 'NOT_FOUND');
});

test('global error boundary catches uncaught exception and returns 500', async () => {
  const throwingDb = {
    DB: {
      prepare() {
        throw new Error('Database crash');
      },
    },
  };

  const response = await worker.fetch(authed({ products: [] }), throwingDb);
  assert.equal(response.status, 500);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(body.error, 'Internal server error');
});

// --- logger tests ---------------------------------------------------------

test('logger formats JSON logs and redacts sensitive metadata', async () => {
  const { formatLog } = await import('../src/lib/logger.js');
  const rawLog = formatLog('INFO', 'Test log message', {
    userIp: '127.0.0.1',
    authorization: 'Bearer 12345-abcde',
    secretKey: 'topsecret',
  });

  const parsed = JSON.parse(rawLog);
  assert.equal(parsed.level, 'INFO');
  assert.equal(parsed.msg, 'Test log message');
  assert.equal(parsed.meta.userIp, '127.0.0.1');
  assert.equal(parsed.meta.authorization, '[REDACTED]');
  assert.equal(parsed.meta.secretKey, '[REDACTED]');
});

// --- recovery flow tests ---------------------------------------------------

test('POST /recovery/generate produces a 6-character recovery code', async () => {
  const req = new Request('https://ocular.test/recovery/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
  });
  const response = await worker.fetch(req, stubDb());
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.code, 'string');
  assert.equal(body.code.length, 6);
  assert.ok(body.expiresAt > Date.now());
});

test('POST /recovery/claim rejects invalid code length with 400', async () => {
  const req = new Request('https://ocular.test/recovery/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
    body: JSON.stringify({ code: 'BAD' }),
  });
  const response = await worker.fetch(req, stubDb());
  assert.equal(response.status, 400);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'INVALID_CODE');
});

test('POST /recovery/claim rejects non-existent or expired code with 404', async () => {
  const req = new Request('https://ocular.test/recovery/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VALID_TOKEN}` },
    body: JSON.stringify({ code: 'X9Y8Z7' }),
  });

  // Default stubDb returns null for recovery code lookup
  const response = await worker.fetch(req, stubDb());
  assert.equal(response.status, 404);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'RECOVERY_CODE_NOT_FOUND');
});

// --- rate limiting tests --------------------------------------------------

test('rate limiter rejects requests with 429 when limits are exceeded', async () => {
  const { clearRateLimitStore } = await import('../src/lib/rateLimit.js');
  clearRateLimitStore();

  const RATE_TOKEN = '7f8c9e2a-5b7d-4e8f-9a1b-2c3d4e5f6a7b';
  const makeReq = () =>
    new Request('https://ocular.test/recovery/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RATE_TOKEN}` },
    });

  // Allowed limit for /recovery/generate is 5 requests / 10 min
  for (let i = 0; i < 5; i++) {
    const res = await worker.fetch(makeReq(), stubDb());
    assert.equal(res.status, 200);
  }

  // 6th request must trigger HTTP 429
  const blockedRes = await worker.fetch(makeReq(), stubDb());
  assert.equal(blockedRes.status, 429);
  assert.ok(blockedRes.headers.has('Retry-After'));

  const blockedJson = await blockedRes.json();
  assert.equal(blockedJson.ok, false);
  assert.equal(blockedJson.code, 'TOO_MANY_REQUESTS');

  clearRateLimitStore();
});
