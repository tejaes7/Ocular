/**
 * POST /link — the one route that joins the two identities.
 *
 * The asymmetry it encodes is the thing to protect: **creating** the link needs
 * both credentials at once, so nobody can attach an account to a watchlist on
 * the user's behalf; **removing** it needs only the device, because detaching is
 * a de-escalation and requiring account access to undo it would strand anyone
 * locked out of their Google account with a link they cannot remove. The privacy
 * page promises this can be turned off, so it has to hold even then.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleLink } from '../src/routes/link.js';

const DEVICE = '3f1c9e2a-5b7d-4e8f-9a1b-2c3d4e5f6a7b';
const FIREBASE_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.stub.stub';

/** Records every bound statement so a test can assert what was written. */
function stubDb({ user = { id: 7, firebase_uid: 'uid-1', email: 'shopper@example.com' } } = {}) {
  const calls = [];

  const statement = (sql) => ({
    bind(...args) {
      calls.push({ sql, args });
      return {
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
        first: async () => (/FROM users/i.test(sql) ? user : null),
      };
    },
    run: async () => ({ success: true }),
    all: async () => ({ results: [] }),
    first: async () => null,
  });

  return { calls, DB: { prepare: statement, batch: async (s) => s.map(() => ({ success: true })) } };
}

const post = (body, headers = {}) =>
  new Request('https://ocular.test/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const withFirebase = (body) => post(body, { Authorization: `Bearer ${FIREBASE_TOKEN}` });
const withDevice = (body) => post(body, { Authorization: `Bearer ${DEVICE}` });

const verifyOk = async () => ({ uid: 'uid-1', email: 'shopper@example.com', name: 'A Shopper' });
const verifyFails = async () => {
  throw new Error('bad token');
};

/** The statement that writes the join, whichever direction it went. */
const linkWrite = (env) => env.calls.find((call) => /INSERT INTO devices/i.test(call.sql));

// --- creating the link -----------------------------------------------------

test('an account token plus a device id creates the link', async () => {
  const env = stubDb();
  const response = await handleLink(withFirebase({ deviceId: DEVICE }), env, verifyOk);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.linked, true);
  assert.equal(body.email, 'shopper@example.com');

  const write = linkWrite(env);
  assert.ok(write, 'the device row must be written');
  assert.equal(write.args[3], 7, 'user_id is bound last');
});

test('a device token alone cannot create a link', async () => {
  // The whole point of requiring both: holding a device UUID must never be
  // enough to attach somebody's account to it.
  const env = stubDb();
  const response = await handleLink(withDevice({ deviceId: DEVICE }), env, verifyFails);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_TOKEN');
  assert.equal(linkWrite(env), undefined, 'nothing may be written');
});

test('no credentials at all is a 401, not a silent no-op', async () => {
  const response = await handleLink(post({ deviceId: DEVICE }), stubDb(), verifyOk);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'MISSING_AUTH_HEADER');
});

test('a malformed device id is rejected before the token is even checked', async () => {
  const response = await handleLink(withFirebase({ deviceId: 'not-a-uuid' }), stubDb(), verifyOk);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'BAD_REQUEST');
});

test('an account with no email is refused rather than linked', async () => {
  // Phone and anonymous sign-in mint valid tokens with no email claim. Linking
  // one produces a join that can never deliver anything.
  const env = stubDb({ user: { id: 8, firebase_uid: 'uid-2', email: null } });
  const response = await handleLink(withFirebase({ deviceId: DEVICE }), env, verifyOk);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'NO_EMAIL');
  assert.equal(linkWrite(env), undefined);
});

// --- removing it -----------------------------------------------------------

test('the device can unlink itself with no account token', async () => {
  // This is what the extension calls. It has the device UUID and nothing else.
  const env = stubDb();
  const response = await handleLink(withDevice({ unlink: true }), env, verifyFails);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).linked, false);

  const write = linkWrite(env);
  assert.ok(write, 'the link must actually be cleared');
  assert.equal(write.args[3], null, 'user_id is set to null');
  assert.equal(write.args[0], DEVICE);
});

test('unlinking still works when token verification would fail', async () => {
  // Someone locked out of their Google account must still be able to detach.
  const env = stubDb();
  const response = await handleLink(withDevice({ unlink: true }), env, verifyFails);

  assert.equal(response.status, 200);
});

test('the website can unlink with an account token', async () => {
  const env = stubDb();
  const response = await handleLink(withFirebase({ deviceId: DEVICE, unlink: true }), env, verifyOk);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).linked, false);
  assert.equal(linkWrite(env).args[3], null);
});

test('unlink with no credentials is still rejected', async () => {
  // A bare `{unlink: true}` has no device bearer, so it must fall through to
  // the account path and be refused rather than clearing an arbitrary row.
  const response = await handleLink(post({ unlink: true }), stubDb(), verifyOk);

  assert.equal(response.status, 401);
});

test('a malformed body is a 400', async () => {
  const response = await handleLink(post('{not json', { Authorization: `Bearer ${DEVICE}` }), stubDb(), verifyOk);

  assert.equal(response.status, 400);
});
