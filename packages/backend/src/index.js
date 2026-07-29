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
 * No accounts. A device is a locally generated UUID; nothing here identifies a
 * person. See docs/API.md for the contract.
 */

import { runCron } from './checker/cron.js';
import { json, preflight } from './lib/http.js';
import { handleSync } from './routes/sync.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return preflight();

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'ocular-sync', time: Date.now() });
    }

    if (url.pathname === '/sync' && request.method === 'POST') {
      return handleSync(request, env);
    }

    return json({ ok: false, error: 'Not found' }, 404);
  },

  async scheduled(_event, env, ctx) {
    // waitUntil, so the cron isn't killed the moment scheduled() returns.
    ctx.waitUntil(runCron(env));
  },
};
