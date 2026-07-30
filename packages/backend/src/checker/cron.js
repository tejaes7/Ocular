/**
 * Scheduled price checking.
 *
 * OWNER: Harsha (checking pipeline + retailer coverage).
 *
 * Read this before tuning anything:
 *
 *   The bottleneck is never Cloudflare. It is how quickly a retailer decides
 *   this worker is a bot. Raising MAX_CHECKS_PER_CRON or shortening the cron
 *   does not get fresher prices — it gets you blocked sooner, after which you
 *   get *no* prices. Slower is strictly better here.
 *
 * The browser remains the source of truth (see docs/ARCHITECTURE.md); anything
 * this file produces is advisory and only fills gaps.
 */

import { scanHtml } from '@ocular/shared/htmlscan';
import { dueProducts, recordFailure, recordSuccess } from '../db/queries.js';
import { fetchPage } from './fetch.js';

const MAX_CHECKS_PER_CRON = 40;
const MAX_PER_HOST_PER_CRON = 4;

const BACKOFF_STEPS_MS = [
  60 * 60 * 1000, // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
  24 * 60 * 60 * 1000, // 1 day
  3 * 24 * 60 * 60 * 1000, // 3 days
];

export async function runCron(env) {
  const now = Date.now();
  const intervalMs = Number(env.CHECK_INTERVAL_MINUTES || 180) * 60 * 1000;

  const candidates = await dueProducts(env, {
    now,
    intervalMs,
    // Over-fetch, because the per-host cap will discard some.
    limit: MAX_CHECKS_PER_CRON * 2,
  });

  for (const product of selectBatch(candidates)) {
    await checkOne(env, product).catch((error) => {
      console.error('[Checker]', {
        productId: product.id,
        host: product.hostname,
        error: error.message,
      });
    });
  }
}

/**
 * Spread work across hosts so one large watchlist can't concentrate traffic on a
 * single retailer — which is the fastest way to get the whole worker blocked.
 */
export function selectBatch(candidates) {
  const perHost = new Map();
  const batch = [];

  for (const product of candidates) {
    const count = perHost.get(product.hostname) || 0;
    if (count >= MAX_PER_HOST_PER_CRON) continue;

    perHost.set(product.hostname, count + 1);
    batch.push(product);
    if (batch.length >= MAX_CHECKS_PER_CRON) break;
  }

  return batch;
}

export function backoffFor(failures) {
  return BACKOFF_STEPS_MS[Math.min(failures - 1, BACKOFF_STEPS_MS.length - 1)];
}

export function failureReasonFromResponse(status) {
  switch (status) {
    case 404:
      return 'gone';

    case 403:
      return 'forbidden';

    case 429:
      return 'rate-limited';

    default:
      if (status >= 500) {
        return 'server-error';
      }

      return 'blocked';
  }
}

// fetchImpl is injectable so the write path can be tested without real network I/O.
export async function checkOne(env, product, fetchImpl = fetchPage) {
  const now = Date.now();
  let result;

  try {
    const response = await fetchImpl(product.url);
    result = response.ok
      ? scanHtml(await response.text(), product.canonical_url)
      : { ok: false, reason: failureReasonFromResponse(response.status) };
  } catch (error) {
    result = { ok: false, reason: error.name === 'AbortError' ? 'timeout' : 'fetch-failed' };
  }

  if (!result.ok) {
    const failures = (product.fail_count || 0) + 1;
    const blockedUntil = now + backoffFor(failures);

    console.error('[Checker]', {
      productId: product.id,
      host: product.hostname,
      reason: result.reason,
      failures,
      blockedUntil: new Date(blockedUntil).toISOString(),
    });

    await recordFailure(env, product, {
      now,
      failures,
      blockedUntil,
      reason: result.reason,
    });
    return;
  }

  // recordSuccess is the only writer of the prices table, and the only thing that
  // clears fail_count and advances last_checked_at. Dropping it does not just lose
  // the reading — it leaves the product permanently due, so the cron refetches it
  // every tick forever.
  await recordSuccess(env, product, {
    now,
    price: result.price,
    inStock: result.inStock,
    title: result.title,
  });
}
