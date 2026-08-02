/**
 * Per-caller request throttling.
 *
 * OWNER: Rohith (API + storage), alongside the rest of lib/.
 *
 * **What this is, and what it is not.** State lives in the isolate's memory, so
 * the limit is enforced per worker instance rather than globally: Cloudflare may
 * run several isolates for one Worker, and a caller spread across colos gets a
 * fresh bucket in each. A determined attacker can therefore exceed the nominal
 * rate by whatever factor Cloudflare happens to be scaling to.
 *
 * That is a deliberate trade, not an oversight. The alternatives both cost more
 * than the problem is worth right now:
 *
 *   - A D1 counter table makes every request a database write, on the exact path
 *     whose latency users feel, and burns free-tier writes on traffic we are
 *     trying to reject.
 *   - Cloudflare's native rate-limiting binding is the right long-term answer
 *     and needs no code here beyond swapping `allow()` — but it has to be
 *     provisioned, and nothing is deployed yet.
 *
 * What this does buy, cheaply and immediately: a single client cannot sit in a
 * loop hammering `/sync` and drive the D1 row count or the request bill up. The
 * runaway-script and naive-abuse cases are the realistic ones, and this closes
 * them. Revisit once there is real traffic to size it against.
 *
 * Memory is bounded by sweeping expired buckets, so a stream of distinct device
 * ids cannot grow the map without limit.
 */

const buckets = new Map();

/** Buckets untouched for this long are dropped on the next sweep. */
const SWEEP_AFTER_MS = 10 * 60 * 1000;
let lastSweep = 0;

function sweep(now) {
  if (now - lastSweep < SWEEP_AFTER_MS) return;
  lastSweep = now;

  for (const [key, bucket] of buckets) {
    if (now - bucket.start > SWEEP_AFTER_MS) buckets.delete(key);
  }
}

/**
 * Fixed-window counter.
 *
 * Fixed rather than sliding because the failure mode of a fixed window — up to
 * 2x the limit across a window boundary — is irrelevant at these limits, and a
 * sliding log would mean retaining a timestamp per request per caller.
 *
 * @param {string} key      caller identity: device id, or IP when unauthenticated
 * @param {object} options
 * @param {number} options.limit     requests allowed per window
 * @param {number} options.windowMs  window length
 * @param {number} [options.now]     injectable clock, for tests
 * @returns {{ok: boolean, remaining: number, retryAfterSeconds: number}}
 */
export function allow(key, { limit, windowMs, now = Date.now() }) {
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      // Ceil, so a client that obeys this never comes back a few milliseconds
      // early and eats a second rejection for its trouble.
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000)),
    };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Who is calling, for rate-limiting purposes only.
 *
 * Never use this as an identity for reading or writing data — `deviceIdFrom` is
 * the security boundary and this deliberately falls back to a spoofable header.
 * A wrong answer here costs an attacker a shared bucket, nothing more.
 */
export function callerKey(request, deviceId) {
  if (deviceId) return `device:${deviceId}`;
  return `ip:${request.headers.get('CF-Connecting-IP') || 'unknown'}`;
}

/** Reset all state. Tests only — isolates never need this in production. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}
