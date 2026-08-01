/**
 * Tests for the /me account route.
 *
 * These assert on **what reached the database**, not on what the route returned.
 * That is deliberate. PR #7 dropped `recordSuccess` and shipped green because
 * every backend test covered a pure helper; the write path had no test that
 * could notice. `upsertUser`'s whole purpose is a write, so a recording D1 stub
 * captures the SQL and the bound arguments and the tests read them back.
 *
 * Token verification is injected rather than mocked at the module level: the
 * real one calls Google's JWKS endpoint, and a unit test should not need the
 * network. The one case that *is* exercised against the real verifier is the
 * missing-config path, which throws before any fetch happens.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import worker from '../src/index.js';
import { getCurrentUser } from '../src/routes/auth.js';
import { verifyFirebaseToken } from '../src/auth/verifyFirebase.js';

const ENV_VARS = { FIREBASE_PROJECT_ID: 'ocular-test' };

const GOOGLE_USER = {
  uid: 'firebase-uid-abc123',
  email: 'shopper@example.com',
  name: 'A Shopper',
  photoURL: 'https://example.com/avatar.png',
};

/**
 * D1 double that records every bound statement. `RETURNING *` is simulated by
 * echoing the bound arguments back as a row, which is what the real upsert does.
 */
function recordingDb(rowFor = echoRow) {
  const writes = [];

  return {
    writes,
    env: {
      ...ENV_VARS,
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              writes.push({ sql, args });
              return {
                first: async () => rowFor({ sql, args }),
                run: async () => ({ success: true }),
                all: async () => ({ results: [] }),
              };
            },
          };
        },
      },
    },
  };
}

const echoRow = ({ args }) => ({
  id: 1,
  firebase_uid: args[0],
  email: args[1],
  display_name: args[2],
  photo_url: args[3],
  created_at: '2026-08-01 00:00:00',
  updated_at: '2026-08-01 00:00:00',
});

const verifierFor = (user) => async () => user;
const rejectingVerifier = async () => {
  throw new Error('signature verification failed');
};

const meRequest = (headers = {}) =>
  new Request('https://ocular.test/me', { method: 'GET', headers });

const authed = (token = 'a.token.value') => meRequest({ Authorization: `Bearer ${token}` });

// --- rejection paths -------------------------------------------------------

test('GET /me without an Authorization header is rejected', async () => {
  const db = recordingDb();
  const response = await getCurrentUser(meRequest(), db.env, verifierFor(GOOGLE_USER));

  assert.equal(response.status, 401);
  assert.equal(db.writes.length, 0, 'an unauthenticated call must not touch the database');
});

test('GET /me with a scheme but no token is rejected', async () => {
  // The Headers API trims the value, so `Bearer   ` arrives as `Bearer`. A
  // prefix-strip leaves the literal string "Bearer" and hands it to the verifier
  // as a credential; requiring the scheme to be followed by something rejects it.
  for (const header of ['Bearer   ', 'Bearer', 'Bearer ']) {
    const db = recordingDb();
    const response = await getCurrentUser(meRequest({ Authorization: header }), db.env, verifierFor(GOOGLE_USER));

    assert.equal(response.status, 401, `should reject: ${JSON.stringify(header)}`);
    assert.equal(db.writes.length, 0);
  }
});

test('GET /me rejects a token sent without the Bearer scheme', async () => {
  const db = recordingDb();
  const response = await getCurrentUser(meRequest({ Authorization: 'a.token.value' }), db.env, verifierFor(GOOGLE_USER));

  assert.equal(response.status, 401);
  assert.equal(db.writes.length, 0);
});

test('GET /me writes nothing when the token fails verification', async () => {
  const db = recordingDb();
  const response = await getCurrentUser(authed(), db.env, rejectingVerifier);

  assert.equal(response.status, 401);
  assert.equal(db.writes.length, 0, 'a rejected token must not create an account');
});

// --- the write path --------------------------------------------------------

test('first login writes the account row', async () => {
  const db = recordingDb();
  const response = await getCurrentUser(authed(), db.env, verifierFor(GOOGLE_USER));

  assert.equal(response.status, 200);
  assert.equal(db.writes.length, 1, 'exactly one statement — the upsert, no separate re-SELECT');

  const [write] = db.writes;
  assert.match(write.sql, /INSERT INTO users/i);
  assert.deepEqual(write.args, [
    'firebase-uid-abc123',
    'shopper@example.com',
    'A Shopper',
    'https://example.com/avatar.png',
  ]);
});

test('a repeat login refreshes the existing row instead of failing on the unique uid', async () => {
  const db = recordingDb();

  await getCurrentUser(authed(), db.env, verifierFor(GOOGLE_USER));
  await getCurrentUser(authed(), db.env, verifierFor({ ...GOOGLE_USER, name: 'Renamed Shopper' }));

  assert.equal(db.writes.length, 2);
  for (const write of db.writes) {
    assert.match(
      write.sql,
      /ON CONFLICT\(firebase_uid\) DO UPDATE/i,
      'check-then-insert would 500 on a concurrent first login; the upsert must not'
    );
  }
  assert.equal(db.writes[1].args[2], 'Renamed Shopper', 'profile changes are picked up');
});

test('a token carrying no email binds null rather than undefined', async () => {
  // Phone and anonymous sign-in produce a valid token with no email claim.
  // Binding `undefined` throws in D1, and the column was NOT NULL UNIQUE until
  // migration 0002 was corrected — either one turns a legitimate login into a 500.
  const db = recordingDb();
  // No `email` key at all — this is the shape a token with no email claim
  // produces, and `undefined` is what the binding used to receive.
  const phoneUser = { uid: 'uid-phone-1', name: '', photoURL: '' };

  const response = await getCurrentUser(authed(), db.env, verifierFor(phoneUser));
  assert.equal(response.status, 200);

  const [write] = db.writes;
  assert.equal(write.args[1], null);
  for (const [i, arg] of write.args.entries()) {
    assert.notEqual(arg, undefined, `bound argument ${i} must never be undefined`);
  }
});

test('two accounts may share an email address', async () => {
  // Signing in with Google and later with email/password mints a second uid for
  // the same person. A UNIQUE email column would lock them out on that second
  // login, so nothing may key on the address.
  const db = recordingDb();

  await getCurrentUser(authed(), db.env, verifierFor(GOOGLE_USER));
  await getCurrentUser(authed(), db.env, verifierFor({ ...GOOGLE_USER, uid: 'uid-password-2' }));

  assert.equal(db.writes.length, 2);
  assert.notEqual(db.writes[0].args[0], db.writes[1].args[0], 'distinct uids');
  assert.equal(db.writes[0].args[1], db.writes[1].args[1], 'same email, both accepted');
});

// --- response shape --------------------------------------------------------

test('GET /me returns the documented fields and not the internal row id', async () => {
  const db = recordingDb();
  const response = await getCurrentUser(authed(), db.env, verifierFor(GOOGLE_USER));
  const body = await response.json();

  assert.equal(body.ok, true);
  assert.deepEqual(Object.keys(body.user).sort(), ['displayName', 'email', 'photoURL', 'uid']);
  assert.equal(body.user.uid, 'firebase-uid-abc123');
  assert.equal(body.user.displayName, 'A Shopper');
});

test('GET /me reports a failed write as a 500, never as a hollow success', async () => {
  // The old check-then-insert could return { ok: true, user: null } if the
  // follow-up SELECT came back empty. A caller reading body.user.uid would throw.
  const db = recordingDb(() => null);
  const response = await getCurrentUser(authed(), db.env, verifierFor(GOOGLE_USER));

  assert.equal(response.status, 500);
  assert.equal((await response.json()).ok, false);
});

// --- configuration ---------------------------------------------------------

test('verification refuses to run without FIREBASE_PROJECT_ID', async () => {
  // Guards the removed hardcoded default. With one, an unconfigured deploy still
  // accepts tokens — just from the wrong project — and looks healthy doing it.
  await assert.rejects(
    () => verifyFirebaseToken('a.b.c', {}),
    /FIREBASE_PROJECT_ID/,
    'a missing project id must fail loudly, not fall back'
  );
});

// --- routing ---------------------------------------------------------------

test('GET /me is wired into the worker and rejects an anonymous call', async () => {
  const response = await worker.fetch(meRequest(), recordingDb().env);
  assert.equal(response.status, 401);
});

test('POST /me is not accepted — /me is a GET', async () => {
  const response = await worker.fetch(
    new Request('https://ocular.test/me', { method: 'POST' }),
    recordingDb().env
  );
  assert.equal(response.status, 404);
});
