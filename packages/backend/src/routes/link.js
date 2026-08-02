/**
 * POST /link — attach this device's watchlist to an account, so price drops
 * found while the browser is closed can be emailed.
 *
 * OWNER: Rohith (API + storage).
 *
 * ---------------------------------------------------------------------------
 * This is the route that joins the two identities.
 *
 * Everywhere else in this service they are kept apart: `/sync` sees only an
 * anonymous device UUID, `/me` sees only an account. This route deliberately
 * sees both, and writes `devices.user_id` — after which prices -> device -> user
 * is a two-hop join, and the watchlist stops being anonymous.
 *
 * That is a decision, taken on 2026-08-02 and recorded in
 * migrations/0003_email_alerts.sql. The properties that keep it narrow:
 *
 *   - It requires *both* credentials in one call. Neither a device token nor a
 *     Firebase token alone can create the link, so nothing can be joined on the
 *     user's behalf by a caller holding only one of them.
 *   - It is opt-in and reversible. `userId: null` detaches, and the device goes
 *     back to being exactly as anonymous as it was before.
 *   - Nothing else changes. No price row gains a column, `/sync` is untouched,
 *     and a device that never calls this route is unaffected.
 * ---------------------------------------------------------------------------
 */

import { verifyFirebaseToken } from '../auth/verifyFirebase.js';
import { bearerTokenFrom, deviceIdFrom, fail, isDeviceId, json } from '../lib/http.js';
import { findUserByFirebaseUID, upsertUser } from '../db/users.js';
import { linkDeviceToUser } from '../db/queries.js';

/**
 * `verify` is injectable so the route can be tested without a round trip to
 * Google's JWKS endpoint. Production callers pass nothing.
 */
export async function handleLink(request, env, verify = verifyFirebaseToken) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('BAD_REQUEST', 'Body must be JSON', 400);
  }

  // Unlinking needs only proof that you hold the device.
  //
  // Detaching is a de-escalation: it removes the join, it can never create one,
  // and it discloses nothing. Requiring the account token to undo what the
  // account token created would strand anyone locked out of their Google
  // account with a link they cannot remove — and "you can turn this off" is a
  // promise the privacy page makes, so it has to hold even then.
  //
  // No ambiguity between the two auth modes: deviceIdFrom only matches a bare
  // UUID, and a Firebase ID token is never that shape.
  const deviceBearer = deviceIdFrom(request);
  if (body?.unlink === true && deviceBearer) {
    try {
      await linkDeviceToUser(env, deviceBearer, null, Date.now());
      return json({ ok: true, linked: false });
    } catch (error) {
      console.error('[Link] Could not unlink device:', error?.message ?? error);
      return fail('PERSIST_FAILED', 'Could not unlink this device', 500);
    }
  }

  const bearer = bearerTokenFrom(request);
  if (bearer.error === 'MISSING') {
    return fail('MISSING_AUTH_HEADER', 'Authorization header missing', 401);
  }
  if (bearer.error === 'MALFORMED') {
    return fail('MALFORMED_AUTH_HEADER', 'Expected an Authorization: Bearer <token> header', 401);
  }

  // The same strict UUID shape `/sync` enforces. Anything guessable or
  // attacker-chosen must not become a storage key, and this route can attach an
  // email address to whatever it is given.
  if (!isDeviceId(body?.deviceId)) {
    return fail('BAD_REQUEST', 'deviceId must be a UUID', 400);
  }
  const deviceId = body.deviceId.toLowerCase();

  let firebaseUser;
  try {
    firebaseUser = await verify(bearer.token, env);
  } catch (error) {
    // Never log the token: it is a bearer credential.
    console.error('[Link] Firebase verification failed:', error?.message ?? error);
    return fail('INVALID_TOKEN', 'Invalid Firebase token', 401);
  }

  const now = Date.now();

  try {
    // Detach from the account side — the website's "turn off email alerts".
    // The device-token path above covers the extension, which has no token.
    if (body.unlink === true) {
      await linkDeviceToUser(env, deviceId, null, now);
      return json({ ok: true, linked: false });
    }

    const user = (await findUserByFirebaseUID(env.DB, firebaseUser.uid))
      // First sign-in on this device may precede any call to /me.
      || (await upsertUser(env.DB, firebaseUser));

    if (!user) return fail('PERSIST_FAILED', 'Could not persist user', 500);

    if (!user.email) {
      // Phone and anonymous sign-in mint valid tokens with no email claim.
      // Linking would produce an account that can never be emailed, so say so
      // rather than silently creating a link that does nothing.
      return fail('NO_EMAIL', 'This account has no email address to send alerts to', 400);
    }

    await linkDeviceToUser(env, deviceId, user.id, now);
    return json({ ok: true, linked: true, email: user.email });
  } catch (error) {
    console.error('[Link] Could not link device:', error?.message ?? error);
    return fail('PERSIST_FAILED', 'Could not link this device', 500);
  }
}
