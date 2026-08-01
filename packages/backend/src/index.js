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
import { checkDbHealth } from './db/queries.js';
import { deviceIdFrom, errorJson, json, preflight } from './lib/http.js';
import { logger } from './lib/logger.js';
import { checkRateLimit } from './lib/rateLimit.js';
import { handleClaimRecovery, handleGenerateRecovery } from './routes/recovery.js';
import { handleSync } from './routes/sync.js';

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') return preflight();

      if (url.pathname === '/health') {
        const dbHealthy = await checkDbHealth(env);
        const status = dbHealthy ? 200 : 503;
        return json(
          {
            ok: dbHealthy,
            service: 'ocular-sync',
            status: dbHealthy ? 'healthy' : 'degraded',
            db: dbHealthy ? 'connected' : 'disconnected',
            time: Date.now(),
          },
          status
        );
      }

      const clientKey =
        deviceIdFrom(request) || request.headers.get('cf-connecting-ip') || 'anonymous';

      if (url.pathname === '/sync' && request.method === 'POST') {
        const rate = checkRateLimit(`sync:${clientKey}`, 60, 60000);
        if (!rate.allowed) {
          logger.warn('Rate limit exceeded on /sync', { clientKey });
          return errorJson(
            'Too many requests. Please try again later.',
            429,
            'TOO_MANY_REQUESTS',
            undefined,
            { 'Retry-After': String(rate.retryAfterSeconds) }
          );
        }
        return await handleSync(request, env);
      }

      if (url.pathname === '/recovery/generate' && request.method === 'POST') {
        const rate = checkRateLimit(`recovery-gen:${clientKey}`, 5, 600000);
        if (!rate.allowed) {
          logger.warn('Rate limit exceeded on /recovery/generate', { clientKey });
          return errorJson(
            'Too many recovery generation attempts. Please wait before trying again.',
            429,
            'TOO_MANY_REQUESTS',
            undefined,
            { 'Retry-After': String(rate.retryAfterSeconds) }
          );
        }
        return await handleGenerateRecovery(request, env);
      }

      if (url.pathname === '/recovery/claim' && request.method === 'POST') {
        const rate = checkRateLimit(`recovery-claim:${clientKey}`, 5, 600000);
        if (!rate.allowed) {
          logger.warn('Rate limit exceeded on /recovery/claim', { clientKey });
          return errorJson(
            'Too many recovery claim attempts. Please wait before trying again.',
            429,
            'TOO_MANY_REQUESTS',
            undefined,
            { 'Retry-After': String(rate.retryAfterSeconds) }
          );
        }
        return await handleClaimRecovery(request, env);
      }

      return errorJson('Not found', 404, 'NOT_FOUND');
    } catch (err) {
      logger.error('Unhandled worker exception', err);
      return errorJson('Internal server error', 500, 'INTERNAL_SERVER_ERROR');
    }
  },

  async scheduled(_event, env, ctx) {
    // waitUntil, so the cron isn't killed the moment scheduled() returns.
    ctx.waitUntil(runCron(env));
  },
};
