/**
 * Outbound email for price alerts.
 *
 * Resend rather than SendGrid: it is one authenticated POST with a JSON body,
 * which is all a Worker can comfortably do. No SDK, no Node builtins, nothing
 * that needs a compatibility flag.
 *
 * Configuration is two Worker secrets. Set them with:
 *
 *   npx wrangler secret put RESEND_API_KEY
 *   npx wrangler secret put ALERT_FROM_EMAIL     # e.g. alerts@yourdomain.com
 *
 * ALERT_FROM_EMAIL must be on a domain verified in Resend, otherwise every send
 * is rejected with a 403 that looks like an auth failure.
 *
 * **An unconfigured mailer is not an error.** It returns `skipped` and the cron
 * carries on. Price checking is the product; email is an addition to it, and a
 * missing secret must never take down the thing that still works without it.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10000;

/**
 * @param {Record<string, any>} env
 */
export function emailConfigured(env) {
  return Boolean(env?.RESEND_API_KEY && env?.ALERT_FROM_EMAIL);
}

/**
 * @param {Record<string, any>} env
 * @param {{ to: string, subject: string, text?: string, html?: string }} params
 * @returns {Promise<{ok: boolean, skipped?: boolean, id?: string, error?: string}>}
 */
export async function sendEmail(env, { to, subject, text, html }) {
  if (!emailConfigured(env)) {
    console.warn('[Email] Not configured — set RESEND_API_KEY and ALERT_FROM_EMAIL. Skipping.');
    return { ok: false, skipped: true, error: 'not-configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.ALERT_FROM_EMAIL, to: [to], subject, text, html }),
    });

    if (!response.ok) {
      // Body, not just status: Resend puts the actionable part ("domain not
      // verified", "from address not allowed") in the payload, and a bare 403
      // sends you looking at the API key instead.
      const detail = await response.text().catch(() => '');
      console.error('[Email] Send failed', { status: response.status, detail: detail.slice(0, 300) });
      return { ok: false, error: `resend-${response.status}` };
    }

    const payload = await response.json().catch(() => ({}));
    return { ok: true, id: payload.id };
  } catch (error) {
    const err = /** @type {any} */ (error);
    const reason = err?.name === 'AbortError' ? 'timeout' : 'network';
    console.error('[Email] Send failed', { reason, message: err?.message || String(error) });
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}
