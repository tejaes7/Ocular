// Base URL for the @ocular/backend Cloudflare Worker.
//
// This was hardcoded to http://127.0.0.1:8787 (the wrangler dev port), which
// would make the deployed site call a machine that isn't there. The deployed
// worker is the default; point VITE_API_BASE at localhost in a .env.local when
// you want to develop against `wrangler dev`. See .env.example.
const API_BASE = (
  import.meta.env.VITE_API_BASE || 'https://ocular.ocularxvision.workers.dev'
).replace(/\/+$/, '');

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

/** Exchange a Firebase ID token for the caller's backend profile. */
export function getCurrentUser(token) {
  return request('/me', { method: 'GET', token });
}

/** Liveness probe — the worker checks D1 readiness and 503s when degraded. */
export function getHealth() {
  return request('/health', { method: 'GET' });
}

export { API_BASE };
