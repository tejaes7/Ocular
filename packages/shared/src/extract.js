/**
 * Price extraction. Pure functions — every entry point takes a `Document`, so
 * the same code runs in a content script (live page) and in the offscreen
 * document (HTML fetched by the background worker).
 *
 * Strategy ladder, cheapest and most durable first:
 *   1. JSON-LD Product schema   — most sites ship this for Google Shopping
 *   2. Microdata / OpenGraph    — meta tags
 *   3. Site selector pack       — hand-written, rots over time
 *   4. Visual heuristic         — score every currency-looking text node
 *   5. AI  (see ai.js)          — only when 1-4 all miss
 */

import { sitePackFor, canonicalizeUrl, siteLabel } from './sites.js';

const CURRENCY_BY_SYMBOL = {
  '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
  '₩': 'KRW', '₽': 'RUB', 'A$': 'AUD', 'C$': 'CAD',
};

const CURRENCY_WORDS = /\b(INR|USD|EUR|GBP|JPY|AUD|CAD|AED|SGD|Rs\.?|रु)\b/i;

export const PRICE_TEXT_RE = /(?:₹|Rs\.?|INR|\$|€|£)\s?\d[\d.,]*|\d[\d.,]*\s?(?:₹|INR|USD|EUR|GBP)/i;

/**
 * Parse a price from messy real-world text.
 *
 * Handles the three grouping conventions that actually show up:
 *   "₹1,29,999"   Indian lakh grouping  -> 129999
 *   "$1,299.00"   thousands + decimal   -> 1299
 *   "1.299,00 €"  European              -> 1299
 *
 * The trick is deciding whether the last separator is a decimal point or a
 * grouping mark: it's only a decimal if exactly 1-2 digits follow it.
 */
export function parsePrice(input) {
  if (input == null) return null;
  if (typeof input === 'number') {
    // A zero or negative price is never real, and letting one through would
    // poison the history and fire a bogus "all-time low" alert.
    return Number.isFinite(input) && input > 0 ? { value: input, currency: null } : null;
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const currency = detectCurrency(raw);
  const digits = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return null;

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  let decimalSep = null;
  if (lastComma > lastDot) decimalSep = ',';
  else if (lastDot > lastComma) decimalSep = '.';

  if (decimalSep) {
    const fractionLength = digits.length - digits.lastIndexOf(decimalSep) - 1;
    // 3+ trailing digits means it was a thousands separator, not a decimal.
    if (fractionLength === 0 || fractionLength > 2) decimalSep = null;
  }

  let normalized;
  if (decimalSep) {
    const at = digits.lastIndexOf(decimalSep);
    normalized = `${digits.slice(0, at).replace(/[.,]/g, '')}.${digits.slice(at + 1)}`;
  } else {
    normalized = digits.replace(/[.,]/g, '');
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, currency };
}

function detectCurrency(text) {
  for (const [symbol, code] of Object.entries(CURRENCY_BY_SYMBOL)) {
    if (text.includes(symbol)) return code;
  }
  const word = text.match(CURRENCY_WORDS);
  if (word) {
    const token = word[1].toUpperCase().replace(/\.$/, '');
    return token === 'RS' || token === 'रु' ? 'INR' : token;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strategy 1: JSON-LD
// ---------------------------------------------------------------------------

/** Flatten arrays and `@graph` containers into a plain list of nodes. */
export function flattenJsonLd(input) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    out.push(node);
    if (node['@graph']) walk(node['@graph']);
  };
  walk(input);
  return out;
}

function collectJsonLdNodes(doc) {
  const raw = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      raw.push(JSON.parse(script.textContent.trim()));
    } catch {
      // Malformed JSON-LD is extremely common. Skip it silently.
    }
  }
  return raw;
}

function isProductNode(node) {
  const type = node['@type'];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => String(t).toLowerCase().includes('product'));
}

function readOffer(offers) {
  if (!offers) return null;

  const list = Array.isArray(offers) ? offers : [offers];

  for (const offer of list) {
    if (!offer || typeof offer !== 'object') continue;

    // AggregateOffer nests real offers, or exposes lowPrice directly.
    if (offer.offers) {
      const nested = readOffer(offer.offers);
      if (nested) return nested;
    }

    const rawPrice =
      offer.price ??
      offer.lowPrice ??
      offer.priceSpecification?.price ??
      offer.priceSpecification?.minPrice;

    const parsed = parsePrice(rawPrice);
    if (!parsed) continue;

    const availability = String(offer.availability || '').toLowerCase();

    const unavailable = [
      'outofstock',
      'out_of_stock',
      'soldout',
      'sold_out',
      'discontinued',
      'preorder',
      'pre-order',
    ];

    const inStock =
      availability === ''
        ? true
        : !unavailable.some((state) => availability.includes(state));

    return {
      value: parsed.value,
      currency:
        offer.priceCurrency ||
        offer.priceSpecification?.priceCurrency ||
        parsed.currency,
      inStock,
    };
  }

  return null;
}

/**
 * Interpret already-parsed JSON-LD values.
 *
 * Split out from the DOM lookup so Cloudflare Workers — which have no DOMParser
 * — can reuse exactly this logic against regex-extracted script blocks.
 * See htmlscan.js.
 */
export function interpretJsonLd(rawNodes) {
  for (const node of flattenJsonLd(rawNodes)) {
    if (!isProductNode(node)) continue;

    const offer = readOffer(node.offers);
    if (!offer) continue;

    const image = Array.isArray(node.image)
      ? node.image[0]
      : node.image;

    const title =
      typeof node.name === 'string'
        ? node.name
        : null;

    return {
      strategy: 'jsonld',
      price: offer.value,
      currency: offer.currency,
      inStock: offer.inStock,
      title,
      image: typeof image === 'string'
        ? image
        : image?.url || null,
    };
  }

  return null;
}

function fromJsonLd(doc) {
  return interpretJsonLd(collectJsonLdNodes(doc));
}

// ---------------------------------------------------------------------------
// Strategy 2: microdata + OpenGraph meta tags
// ---------------------------------------------------------------------------

function fromMetadata(doc) {
  const metaSelectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]',
    'meta[name="twitter:data1"]',
  ];

  for (const selector of metaSelectors) {
    const parsed = parsePrice(doc.querySelector(selector)?.content);
    if (!parsed) continue;

    const currency =
      doc.querySelector('meta[property="product:price:currency"]')?.content ||
      doc.querySelector('meta[property="og:price:currency"]')?.content ||
      doc.querySelector('meta[itemprop="priceCurrency"]')?.content ||
      parsed.currency;

    return {
      strategy: 'meta',
      price: parsed.value,
      currency,
      inStock: !/outofstock/i.test(
        doc.querySelector('meta[property="product:availability"]')?.content || ''
      ),
      title: null,
      image: null,
    };
  }

  // Microdata sitting on a real element rather than a <meta>.
  const itemprop = doc.querySelector('[itemprop="price"]');
  if (itemprop) {
    const parsed = parsePrice(itemprop.getAttribute('content') || itemprop.textContent);
    if (parsed) {
      return {
        strategy: 'microdata',
        price: parsed.value,
        currency:
          doc.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content') ||
          parsed.currency,
        inStock: true,
        title: null,
        image: null,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Strategy 3: site selector pack (incl. AI-learned selectors)
// ---------------------------------------------------------------------------

function firstMatch(doc, selectors) {
  for (const selector of selectors || []) {
    try {
      const el = doc.querySelector(selector);
      if (el) return el;
    } catch {
      // A learned selector can be syntactically invalid. Ignore and continue.
    }
  }
  return null;
}

/**
 * First selector that yields a *parseable price* — not merely the first that
 * matches an element.
 *
 * That distinction is the entire value of an ordered selector list. This used to
 * call firstMatch(), take the one element it returned, and give up if its text
 * did not parse — so a single present-but-empty node defeated every remaining
 * fallback.
 *
 * Amazon does exactly that. `#corePriceDisplay_desktop_feature_div .priceToPay
 * .a-offscreen` is present and **empty** on a fetched product page, while the
 * third selector in the list holds "₹349.00". The rung therefore always failed on
 * amazon.in and handed the page to the guessing rung, which is where the wrong
 * prices came from. Amazon publishes no JSON-LD and no `og:price`, so this rung is
 * the *only* reliable reader for it.
 */
function fromSelectors(doc, selectors, strategy = 'selector') {
  for (const selector of selectors || []) {
    let el;
    try {
      el = doc.querySelector(selector);
    } catch {
      continue; // A learned selector can be syntactically invalid.
    }
    if (!el) continue;

    const parsed = parsePrice(el.getAttribute?.('content') || el.textContent);
    if (!parsed) continue;

    return {
      strategy,
      price: parsed.value,
      currency: parsed.currency,
      inStock: true,
      title: null,
      image: null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strategy 4: visual heuristic
// ---------------------------------------------------------------------------

const DEMOTE_RE = /\b(m\.?r\.?p|list price|was|save|you save|off|emi|per month|delivery|shipping|coupon|cashback|exchange|total)\b/i;
const PROMOTE_RE = /\b(price|deal|offer|selling|our price|now)\b/i;

/**
 * Per-unit pricing, which retailers show right next to the pack price.
 *
 * A pack of 4 listed at ₹379 also renders "₹94.75 per count". Reading the unit
 * price as the selling price is a silent 4x underestimate that looks exactly
 * like a price drop — observed in the wild on amazon.in.
 */
const UNIT_PRICE_RE =
  /(per\s*(count|unit|piece|item|pc|tablet|capsule|sheet|100\s*(g|ml)|kg|g|ml|l|litre|liter)|\/\s*(count|unit|piece|pc|kg|g|ml|l)\b|\beach\b)/i;

/** A tie this narrow means the two candidates are not meaningfully separated. */
const DECISIVE_MARGIN = 3;

/**
 * Is this document rendered, or just parsed?
 *
 * `DOMParser` documents have no renderer, so `getComputedStyle` reports nothing
 * geometric. That matters enormously here: font size and line-through are the
 * heuristic's two strongest signals, and on a parsed document they silently
 * evaluate to zero rather than failing. Every candidate then scores almost the
 * same and the ranking becomes meaningless.
 *
 * The offscreen document (used for every `fetch` check) parses HTML without
 * rendering it, so this returns false there and true in a real tab or content
 * script.
 */
function hasLayout(doc) {
  // The discriminator is the browsing context, not a geometry probe. A
  // DOMParser document is not attached to one, so `defaultView` is null per
  // spec and getComputedStyle is unreachable. A document in a real tab or
  // content script always has a view.
  try {
    return typeof doc.defaultView?.getComputedStyle === 'function';
  } catch {
    return false;
  }
}

/**
 * Score every element whose *own* text looks like a price and pick the best.
 * Cues: struck-through text is a list price, "M.R.P" is a list price, being
 * near the <h1> is good, being enormous on screen is good.
 *
 * Refuses to answer rather than guessing when the two leading candidates are
 * not clearly separated and there is no layout to separate them with. A wrong
 * price is worse than no price: it poisons the stored history, drags the median
 * down and fires a bogus "lowest ever" alert.
 */
function fromHeuristic(doc) {
  const layout = hasLayout(doc);
  const candidates = [];
  const heading = doc.querySelector('h1');

  for (const el of doc.querySelectorAll('span, div, p, b, strong, h2, h3, h4, ins, bdi')) {
    if (el.children.length > 2) continue; // want leaf-ish nodes

    const text = (el.textContent || '').trim();
    if (!text || text.length > 40) continue;
    if (!PRICE_TEXT_RE.test(text)) continue;

    const parsed = parsePrice(text);
    if (!parsed || parsed.value < 1) continue;

    let score = 0;
    const context = `${el.className || ''} ${el.id || ''} ${el.parentElement?.className || ''}`;

    if (DEMOTE_RE.test(text) || DEMOTE_RE.test(context)) score -= 6;
    if (PROMOTE_RE.test(context)) score += 3;

    // A unit price is a real price, just not the one the shopper pays. Check
    // the surrounding text too: the "per count" label is usually a sibling node,
    // so the price element's own text is only "₹94.75".
    const nearby = `${text} ${el.parentElement?.textContent?.slice(0, 120) || ''}`;
    if (UNIT_PRICE_RE.test(nearby)) score -= 10;

    // Struck-through markup almost always means "old price".
    if (el.closest('s, del, strike')) score -= 8;

    // Real rendered geometry — only available in a live page, not a parsed one.
    const fontSize = Number.parseFloat(el.ownerDocument?.defaultView?.getComputedStyle?.(el)?.fontSize || 0);
    if (fontSize) score += Math.min(fontSize / 6, 6);
    const decoration = el.ownerDocument?.defaultView?.getComputedStyle?.(el)?.textDecorationLine;
    if (decoration && decoration.includes('line-through')) score -= 8;

    // Proximity to the product title.
    if (heading && heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) score += 2;

    candidates.push({ score, value: parsed.value, currency: parsed.currency });
  }

  if (!candidates.length) return null;

  // Rank on score ONLY. The previous tie-break was `|| a.value - b.value`,
  // ascending — so whenever scores tied it returned the cheapest
  // currency-shaped string on the page. Combined with the zeroed-out geometric
  // signals above, that made every unrendered check a guaranteed underestimate,
  // which the alert layer then reported as a price drop. Ties are ambiguity, and
  // ambiguity must not silently resolve to "cheapest".
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Everything scoring within a hair of the leader is a genuine rival. Compare
  // DISTINCT values across that band rather than just the top two: a price sits
  // in both a <div> and its <span>, so both are scored, and the duplicate would
  // otherwise always look like corroboration and hide a real three-way tie.
  const contenders = new Set(
    candidates.filter((c) => best.score - c.score < DECISIVE_MARGIN).map((c) => c.value)
  );
  const ambiguous = contenders.size > 1;

  // Without layout there is nothing left to break a tie with, so decline. The
  // ladder's structured rungs (JSON-LD, meta) are the right way to read an
  // unrendered document — that is exactly what htmlscan.js does server-side —
  // and declining lets the checker escalate to a real tab, which has layout.
  if (ambiguous && !layout) return null;

  return {
    // Distinguished in stored history so unrendered readings can be filtered
    // out of a training set later.
    strategy: layout ? 'heuristic' : 'heuristic-blind',
    price: best.value,
    currency: best.currency,
    inStock: true,
    title: null,
    image: null,
    confidence: ambiguous ? 'low' : layout ? 'medium' : 'low',
  };
}

// ---------------------------------------------------------------------------
// Title / image, independent of price strategy
// ---------------------------------------------------------------------------

function extractTitle(doc, pack) {
  const fromPack = firstMatch(doc, pack?.title);
  const candidates = [
    fromPack?.textContent,
    doc.querySelector('meta[property="og:title"]')?.content,
    doc.querySelector('h1')?.textContent,
    doc.title,
  ];
  for (const candidate of candidates) {
    const clean = (candidate || '').replace(/\s+/g, ' ').trim();
    if (clean) return clean.slice(0, 200);
  }
  return 'Untitled product';
}

function extractImage(doc, pack, baseUrl) {
  const fromPack = firstMatch(doc, pack?.image);
  const candidates = [
    fromPack?.getAttribute?.('src'),
    doc.querySelector('meta[property="og:image"]')?.content,
    doc.querySelector('link[rel="image_src"]')?.href,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate, baseUrl).toString();
    } catch {
      // Relative URL with no usable base — skip.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Run the full ladder against a document.
 *
 * @param {Document} doc
 * @param {string} url
 * @param {{ learnedSelector?: string }} [options]
 * @returns {{ ok: boolean, ... }}
 */
export function extractProduct(doc, url, options = {}) {
  const pack = sitePackFor(url);

  const attempts = [
    () => fromJsonLd(doc),
    () => fromMetadata(doc),
    () => (options.learnedSelector ? fromSelectors(doc, [options.learnedSelector], 'learned') : null),
    () => fromSelectors(doc, pack?.price),
    () => fromHeuristic(doc),
  ];

  let result = null;
  for (const attempt of attempts) {
    try {
      result = attempt();
    } catch {
      result = null;
    }
    if (result?.price) break;
  }

  const title = result?.title || extractTitle(doc, pack);
  const image = result?.image || extractImage(doc, pack, url);

  if (!result?.price) {
    return { ok: false, reason: 'no-price', url, canonicalUrl: canonicalizeUrl(url), title, image };
  }

  // Explicit out-of-stock markers beat an optimistic default.
  let inStock = result.inStock !== false;
  if (pack?.outOfStock && firstMatch(doc, pack.outOfStock)) inStock = false;

  return {
    ok: true,
    url,
    canonicalUrl: canonicalizeUrl(url),
    site: siteLabel(url),
    title,
    image,
    price: result.price,
    currency: result.currency || 'INR',
    inStock,
    strategy: result.strategy,
    confidence: result.confidence || 'high',
  };
}

/**
 * Compact the page down to just the parts an LLM needs to find a price.
 *
 * A product page is ~2 MB of HTML; this returns ~2 KB. Never send raw HTML to a
 * model — it is slow, expensive, and *less* accurate than the trimmed version.
 */
export function buildPriceSnippet(doc, limit = 40) {
  const lines = [];
  const seen = new Set();

  for (const el of doc.querySelectorAll('span, div, p, b, strong, h1, h2, h3, ins, bdi, td')) {
    if (el.children.length > 2) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 60 || !PRICE_TEXT_RE.test(text)) continue;

    const path = describeElement(el);
    const line = `${path} :: ${text}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= limit) break;
  }

  const title = (doc.querySelector('h1')?.textContent || doc.title || '').replace(/\s+/g, ' ').trim();
  return `TITLE: ${title.slice(0, 160)}\n\nPRICE CANDIDATES:\n${lines.join('\n')}`;
}

function describeElement(el) {
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className
    ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
    : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
}

export { canonicalizeUrl, siteLabel };
