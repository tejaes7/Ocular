/**
 * In-memory sliding-window rate limiter for worker endpoints.
 *
 * Prevents endpoint hammering, abusive traffic, and brute-force code guessing.
 */

const hitMap = new Map();

/**
 * Clean up expired rate-limit entries periodically.
 */
function cleanupExpired(now) {
  if (hitMap.size < 1000) return;
  for (const [key, timestamps] of hitMap.entries()) {
    const valid = timestamps.filter((ts) => ts > now - 3600000);
    if (valid.length === 0) {
      hitMap.delete(key);
    } else {
      hitMap.set(key, valid);
    }
  }
}

/**
 * Checks rate limit for a given key.
 *
 * @param {string} key - Rate limit key (e.g. `sync:device-uuid`)
 * @param {number} limit - Maximum allowed hits in window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  cleanupExpired(now);

  const windowStart = now - windowMs;
  const history = (hitMap.get(key) || []).filter((ts) => ts > windowStart);

  if (history.length >= limit) {
    const oldestInWindow = history[0];
    const retryAfterSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  history.push(now);
  hitMap.set(key, history);

  return {
    allowed: true,
    remaining: limit - history.length,
    retryAfterSeconds: 0,
  };
}

export function clearRateLimitStore() {
  hitMap.clear();
}
