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

export const json = (body, status = 200, customHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...customHeaders },
  });

/**
 * Generates a standardized JSON error response.
 *
 * @param {string} message - Human-readable error message
 * @param {number} status - HTTP status code (default 400)
 * @param {string} code - Error code identifier (e.g. 'UNAUTHORIZED', 'BAD_REQUEST')
 * @param {object} details - Optional extra error context
 * @param {object} customHeaders - Optional additional response headers
 */
export const errorJson = (
  message,
  status = 400,
  code = 'BAD_REQUEST',
  details = undefined,
  customHeaders = {}
) =>
  json(
    {
      ok: false,
      error: message,
      code,
      ...(details ? { details } : {}),
    },
    status,
    customHeaders
  );

export const preflight = () => new Response(null, { status: 204, headers: CORS });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the caller's device id.
 *
 * There are no accounts. The token *is* the identity: a UUID the extension
 * generated locally. The strict UUID shape is the security boundary — it stops
 * anything guessable, injected, or attacker-chosen from being used as a key.
 * Never loosen this to "any non-empty string".
 */
export function deviceIdFrom(request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return UUID_RE.test(token) ? token.toLowerCase() : null;
}
