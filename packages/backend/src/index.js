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
 * Two identities, joined in exactly one place. `/sync` authenticates with a
 * locally generated device UUID and is the only route that touches price data.
 * `/me` authenticates with a Firebase token and is the only route that knows a
 * person's name — accounts are optional and exist so one person's own browsers
 * can share a watchlist.
 *
 * `/link` is the exception, added 2026-08-02 so that price drops found while
 * the browser is closed can be emailed. It requires both credentials in one
 * call, writes `devices.user_id`, and is reversible. No price row carries a
 * user id — but prices -> device -> user is now a reachable join, so the older
 * "never joined" wording in docs/API.md and packages/web/public/privacy.html no
 * longer describes this service and needs updating to match. See
 * migrations/0003_email_alerts.sql for the decision and what it costs.
 */

import { runCron } from './checker/cron.js';
import { deviceIdFrom, fail, json, preflight, rateLimited } from './lib/http.js';
import { allow, callerKey } from './lib/ratelimit.js';
import { handleSync } from './routes/sync.js';
import { getCurrentUser } from './routes/auth.js';
import { handleLink } from './routes/link.js';

/**
 * Per-route budgets, sized against what an honest client actually does.
 *
 * The extension syncs on startup, on an alarm, and when the user presses a
 * button — call it a handful an hour, with the drain loop in sync.js adding at
 * most MAX_SYNC_PAGES more to a single catch-up. 60/minute leaves that an order
 * of magnitude of headroom while still stopping a runaway loop cold.
 *
 * `/link` is rarer and more sensitive — a person pairs a browser once — so it is
 * tighter, and the low ceiling doubles as brake on anyone grinding at the pairing
 * endpoint. `/health` is left unlimited on purpose: it is what an uptime probe
 * hits on a fixed schedule, and throttling it would manufacture false alarms.
 */
const LIMITS = {
  '/sync': { limit: 60, windowMs: 60_000 },
  '/link': { limit: 10, windowMs: 60_000 },
  '/me': { limit: 30, windowMs: 60_000 },
};

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

    // Before any route body runs, so a throttled request costs no D1 work —
    // which is the entire point of throttling it.
    const budget = LIMITS[url.pathname];
    if (budget) {
      const verdict = allow(callerKey(request, deviceIdFrom(request)), budget);
      if (!verdict.ok) return rateLimited(verdict.retryAfterSeconds);
    }

    if (url.pathname === '/sync' && request.method === 'POST') {
      return handleSync(request, env);
    }

    if (url.pathname === '/me' && request.method === 'GET') {
      return getCurrentUser(request, env);
    }

    if (url.pathname === '/link' && request.method === 'POST') {
      return handleLink(request, env);
    }

    return fail('NOT_FOUND', 'Not found', 404);
  },



  async scheduled(_event, env, ctx) {
    // waitUntil, so the cron isn't killed the moment scheduled() returns.
    ctx.waitUntil(runCron(env));
  },
};
