/**
 * Structured logger for Cloudflare Worker environment.
 *
 * Emits JSON logs compatible with `wrangler tail` and edge logging platforms.
 * Automatically redacts authorization headers and sensitive tokens.
 */

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const sanitized = { ...meta };

  for (const key of Object.keys(sanitized)) {
    if (/token|auth|authorization|password|secret|key/i.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeMeta(sanitized[key]);
    }
  }
  return sanitized;
}

export function formatLog(level, message, meta = undefined) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };

  if (meta !== undefined) {
    payload.meta = sanitizeMeta(meta);
  }

  return JSON.stringify(payload);
}

export const logger = {
  info(message, meta) {
    console.log(formatLog('INFO', message, meta));
  },
  warn(message, meta) {
    console.warn(formatLog('WARN', message, meta));
  },
  error(message, meta) {
    const errorMeta =
      meta instanceof Error
        ? { name: meta.name, message: meta.message, stack: meta.stack }
        : meta;
    console.error(formatLog('ERROR', message, errorMeta));
  },
};
