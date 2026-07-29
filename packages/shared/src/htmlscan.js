/**
 * DOM-free price extraction, for environments with no DOMParser.
 *
 * Cloudflare Workers have no DOM, so the server-side checker can only use the
 * rungs that survive on raw text: JSON-LD and meta tags. That's a deliberate
 * limitation, not an oversight — the browser keeps the full ladder (selector
 * packs and the visual heuristic), and the server is only ever a supplement.
 *
 * Shared with checker.js so block detection stays consistent on both sides.
 */

import { interpretJsonLd, parsePrice } from './extract.js';

export const BLOCK_MARKERS = [
  'api-services-support@amazon.com',
  'enter the characters you see below',
  'to discuss automated access',
  'px-captcha',
  'captcha-delivery.com',
  'are you a human',
  'access denied',
  'request blocked',
  'unusual traffic',
];

export function looksBlocked(html) {
  const head = html.slice(0, 8000).toLowerCase();
  return BLOCK_MARKERS.some((marker) => head.includes(marker));
}

const JSONLD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function collectJsonLd(html) {
  const nodes = [];
  for (const [, body] of html.matchAll(JSONLD_RE)) {
    try {
      nodes.push(JSON.parse(body.trim()));
    } catch {
      // Malformed JSON-LD is extremely common in the wild. Skip it.
    }
  }
  return nodes;
}

/**
 * Read a meta tag's content, tolerating either attribute order:
 *   <meta property="og:x" content="y">  and  <meta content="y" property="og:x">
 */
function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function titleFrom(html) {
  const og = metaContent(html, 'og:title');
  if (og) return og.trim().slice(0, 200);

  const h1 = html.match(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i);
  if (h1) {
    const text = h1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 200);
  }

  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  return title ? title[1].replace(/\s+/g, ' ').trim().slice(0, 200) : null;
}

/**
 * @returns {{ok: true, price, currency, inStock, title, image, strategy} | {ok: false, reason}}
 */
export function scanHtml(html, url) {
  if (typeof html !== 'string' || !html) return { ok: false, reason: 'empty' };
  if (looksBlocked(html)) return { ok: false, reason: 'blocked' };

  const title = titleFrom(html);
  const image = metaContent(html, 'og:image');

  // Rung 1 — JSON-LD.
  const fromJsonLd = interpretJsonLd(collectJsonLd(html));
  if (fromJsonLd?.price) {
    return {
      ok: true,
      price: fromJsonLd.price,
      currency: fromJsonLd.currency || 'INR',
      inStock: fromJsonLd.inStock !== false,
      title: fromJsonLd.title || title,
      image: fromJsonLd.image || image,
      strategy: 'jsonld',
      url,
    };
  }

  // Rung 2 — meta tags.
  for (const key of ['product:price:amount', 'og:price:amount', 'price']) {
    const parsed = parsePrice(metaContent(html, key));
    if (!parsed) continue;

    const currency =
      metaContent(html, 'product:price:currency') ||
      metaContent(html, 'og:price:currency') ||
      metaContent(html, 'priceCurrency') ||
      parsed.currency ||
      'INR';

    const availability = metaContent(html, 'product:availability') || '';
    return {
      ok: true,
      price: parsed.value,
      currency,
      inStock: !/outofstock|out_of_stock/i.test(availability),
      title,
      image,
      strategy: 'meta',
      url,
    };
  }

  return { ok: false, reason: 'no-price', title, url };
}
