/**
 * HTTP primitives: CORS, JSON responses, device-token auth.
 *
 * Shared by every route. Changing anything here affects both the sync API and
 * the cron path, so treat it as a contract — see OWNERSHIP.md.
 */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

/**
 * The error envelope every failing route returns.
 *
 * `code` is the stable, machine-readable part; `error` is a human sentence.
 * Clients branch on `code` and display `error`. That split matters: reword the
 * sentence whenever you like, but changing a code breaks callers silently,
 * because a client checking `code === 'UNAUTHORIZED'` just stops matching and
 * falls into its generic branch. Codes are part of the contract in docs/API.md.
 */
export const fail = (code, message, status) =>
  json({ ok: false, error: message, code }, status);

export const preflight = () => new Response(null, { status: 204, headers: CORS });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the caller's device id.
 *
 * On this path the token *is* the identity: a UUID the extension generated
 * locally. The strict UUID shape is the security boundary — it stops anything
 * guessable, injected, or attacker-chosen from being used as a key. Never
 * loosen this to "any non-empty string".
 *
 * Accounts exist (`GET /me`) but are irrelevant here, and must stay that way:
 * price rows are keyed to the device UUID and never to a user. Resolving an
 * account inside this function is the change docs/API.md forbids.
 */
export function deviceIdFrom(request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return UUID_RE.test(token) ? token.toLowerCase() : null;
}
