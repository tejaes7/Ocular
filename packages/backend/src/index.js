/**
 * Ocular sync worker — keeps checking prices while the browser is closed.
 *
 * This file is just the wiring. The parts that get worked on live elsewhere so
 * two people can edit the backend without colliding:
 *
 *   routes/  +  db/      Rohith  — API surface, storage, auth, deploy
 *   checker/             Harsha  — cron scheduling, fetching, extraction
 *
 * Read this before relying on the service at all:
 *
 *   It runs on Cloudflare's datacenter IPs. Large retailers (Amazon, Flipkart)
 *   will often block it, and no amount of header tuning fixes that — the real
 *   fix is residential proxies, which cost money and would end "free". That is
 *   an accepted, designed-for limitation:
 *
 *     - The browser is always the source of truth. Server readings only fill
 *       gaps where the browser has no observation.
 *     - Blocked hosts back off exponentially rather than hammering.
 *     - Smaller retailers with clean JSON-LD are where this earns its keep.
 *
 * Two identities, and they are never joined. `/sync` authenticates with a
 * locally generated device UUID and is the only route that touches price data.
 * `/me` authenticates with a Firebase token and is the only route that knows a
 * person's name — accounts are optional and exist so one person's own browsers
 * can share a watchlist.
 *
 * The invariant, spelled out in docs/API.md: no row that carries a price may
 * carry a user id. Adding one is a team decision, not a migration.
 */

import { runCron } from './checker/cron.js';
import { fail, json, preflight } from './lib/http.js';
import { handleSync } from './routes/sync.js';
import { getCurrentUser } from './routes/auth.js';

/**
 * Liveness, and it actually checks the thing that fails.
 *
 * A health check that only proves the worker is running answers a question
 * nobody asked — Cloudflare already returns 5xx if the script is dead. What
 * breaks in practice is the D1 binding: a wrong database_id or an unapplied
 * migration leaves the worker up and every route 500ing. So this touches the
 * database and reports 503 when it cannot, which is what makes it usable as an
 * uptime probe rather than decoration.
 */
async function handleHealth(env) {
  let db = 'connected';

  try {
    await env.DB.prepare('SELECT 1').first();
  } catch {
    db = 'unavailable';
  }

  const ok = db === 'connected';

  return json(
    {
      ok,
      service: 'ocular-sync',
      status: ok ? 'healthy' : 'degraded',
      db,
      time: Date.now(),
    },
    ok ? 200 : 503
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight();

    if (url.pathname === '/health') {
      return handleHealth(env);
    }

    if (url.pathname === '/sync' && request.method === 'POST') {
      return handleSync(request, env);
    }

    if (url.pathname === '/me' && request.method === 'GET') {
      return getCurrentUser(request, env);
    }

    return fail('NOT_FOUND', 'Not found', 404);
  },



  async scheduled(_event, env, ctx) {
    // waitUntil, so the cron isn't killed the moment scheduled() returns.
    ctx.waitUntil(runCron(env));
  },
};
