/**
 * Outbound HTTP for the cron checker.
 *
 * OWNER: Harsha.
 *
 * On the User-Agent: we identify honestly. Impersonating Chrome does not defeat
 * modern fingerprinting — TLS and header-order signals give it away regardless —
 * and it makes the traffic look worse under scrutiny, not better. An honest UA
 * with a contact URL is also what gets you unblocked when you ask nicely.
 */

const REQUEST_TIMEOUT_MS = 12000;

export const USER_AGENT =
  'OcularPriceWatcher/1.0 (+https://github.com/tejaes7/Ocular; personal price tracking)';

export async function fetchPage(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
