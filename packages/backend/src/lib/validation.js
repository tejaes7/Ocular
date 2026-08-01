/**
 * Request validation utilities for the Ocular sync worker.
 *
 * Enforces input constraints, payload structure, and URL bounds before
 * database or business logic execution.
 */

const MAX_PRODUCTS_PER_DEVICE = 200;
const MAX_STRING_LENGTH = 2000;
const MAX_TITLE_LENGTH = 500;
const MAX_ID_LENGTH = 128;

/**
 * Validates whether a given string is a valid HTTP or HTTPS URL.
 *
 * @param {string} urlString
 * @returns {boolean}
 */
export function isValidHttpUrl(urlString) {
  if (typeof urlString !== 'string' || urlString.length > MAX_STRING_LENGTH) {
    return false;
  }
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates the payload for POST /sync requests.
 *
 * @param {any} body - Parsed JSON request body
 * @returns {{ valid: boolean, error?: string, data?: { since: number, products: Array } }}
 */
export function validateSyncPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  // Validate `since` timestamp if provided
  let since = 0;
  if ('since' in body) {
    if (typeof body.since !== 'number' || !Number.isFinite(body.since) || body.since < 0) {
      return { valid: false, error: 'Field "since" must be a non-negative finite number' };
    }
    since = body.since;
  }

  // Validate `products` array if provided
  if (body.products !== undefined && body.products !== null && !Array.isArray(body.products)) {
    return { valid: false, error: 'Field "products" must be an array' };
  }

  const rawProducts = Array.isArray(body.products) ? body.products : [];
  if (rawProducts.length > MAX_PRODUCTS_PER_DEVICE) {
    return {
      valid: false,
      error: `Field "products" exceeds maximum allowed size of ${MAX_PRODUCTS_PER_DEVICE}`,
    };
  }

  // Sanitize and filter valid product items
  const validProducts = [];
  for (const item of rawProducts) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    if (
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      item.id.length > MAX_ID_LENGTH
    ) {
      continue;
    }

    if (!isValidHttpUrl(item.canonicalUrl)) {
      continue;
    }

    const title =
      typeof item.title === 'string'
        ? item.title.slice(0, MAX_TITLE_LENGTH)
        : '';

    validProducts.push({
      id: item.id.trim(),
      canonicalUrl: item.canonicalUrl.trim(),
      url: isValidHttpUrl(item.url) ? item.url.trim() : item.canonicalUrl.trim(),
      title,
      currency: typeof item.currency === 'string' ? item.currency.slice(0, 10) : 'INR',
    });
  }

  return {
    valid: true,
    data: {
      since,
      products: validProducts,
    },
  };
}
