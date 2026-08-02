// Base URL for the @ocular/backend Cloudflare Worker.
//
// Deliberately has no default. It was hardcoded to http://127.0.0.1:8787 (the
// wrangler dev port) and then to one specific deployment — both are wrong for
// somebody, and a wrong default is worse than a missing one because the site
// looks fine while talking to a backend nobody meant to call. Set it in
// .env.local for development and in the Vercel project settings for production;
// see .env.example.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

/** Error carrying the worker's `{ ok: false, error, code, details }` envelope. */
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { token, headers, ...init } = {}) {
  // Checked per-request rather than at import time, so a missing setting shows
  // up as one broken feature with a readable message instead of a blank page.
  if (!API_BASE) {
    throw new ApiError(
      'VITE_API_BASE is not set, so there is no backend to call. Add it to .env.local locally, or to the environment variables in your Vercel project settings.',
      { code: 'API_BASE_NOT_CONFIGURED' }
    );
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    // fetch only rejects on network/CORS failure, never on a 4xx/5xx.
    throw new ApiError('Could not reach the Ocular backend.', { code: 'NETWORK_ERROR' });
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (a proxy error page, an empty 204). Leave body null.
  }

  // The worker signals failure both ways: a non-2xx status, and `ok: false` in
  // the documented error envelope. Treat either as an error.
  if (!response.ok || body?.ok === false) {
    throw new ApiError(body?.error || `Request failed (HTTP ${response.status})`, {
      status: response.status,
      code: body?.code,
      details: body?.details,
    });
  }

  return body;
}

/**
 * Exchange a Firebase ID token for the caller's backend profile.
 *
 * Returns the envelope unwrapped: `{ user, isNew }`. Callers were reading
 * `profile.name` and `profile.avatar` off the raw response, which never existed
 * — the worker returns `user.displayName` and `user.photoURL` — so the backend
 * profile was silently discarded and the UI always fell back to the Google one.
 *
 * `isNew` is true only when this call created the account. It exists so the UI
 * can greet a first-time visitor differently without ever asking anyone to
 * choose between "login" and "register", which is a question only the server
 * can answer.
 */
export async function getCurrentUser(token) {
  const body = await request('/me', { method: 'GET', token });
  return { user: body.user ?? null, isNew: Boolean(body.isNew) };
}

/**
 * Attach a browser's watchlist to the signed-in account, so price drops found
 * while that browser is closed can be emailed.
 *
 * This is the one call in the product that joins the two identities — it needs
 * the Firebase token *and* the extension's device id together, which is exactly
 * why the extension hands the device id to this page rather than doing it
 * itself. See the identity section of docs/API.md.
 */
export async function linkDevice(token, deviceId) {
  return request('/link', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
}

/** Detach it again. Same route, and the extension can also do this on its own. */
export async function unlinkDevice(token, deviceId) {
  return request('/link', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, unlink: true }),
  });
}

/** Liveness probe — the worker checks D1 readiness and 503s when degraded. */
export function getHealth() {
  return request('/health', { method: 'GET' });
}

export { API_BASE };
