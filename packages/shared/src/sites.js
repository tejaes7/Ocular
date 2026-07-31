/**
 * Per-site knowledge: URL canonicalisation + selector packs.
 *
 * Selectors here are a *fallback*, not the primary path. Retailers rewrite their
 * markup constantly (Flipkart hash-rotates class names on every deploy), so
 * extract.js tries JSON-LD and metadata first and only reaches for these when
 * the structured data is missing. Treat a broken selector as low severity.
 */

const TRACKING_PARAMS = [
  'ref', 'ref_', 'tag', 'th', 'psc', 'pd_rd_i', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg',
  'pf_rd_i', 'pf_rd_m', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'pf_rd_t', 'linkCode',
  'creative', 'creativeASIN', 'ascsubtag', '_encoding', 'smid', 'qid', 'sr',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'irclickid', 'affid', 'affExtParam1', 'affExtParam2',
  'srsltid', 'store', 'spLa', 'marketplace', 'otracker', 'otracker1', 'ppt',
  'ppn', 'ssid', 'fm', 'iid', 'lid', 'cmpid', 'trackingId',
];

export const SITE_PACKS = [
  {
    id: 'amazon',
    label: 'Amazon',
    match: /(^|\.)amazon\.(in|com|co\.uk|de|fr|it|es|ae|sa|sg|com\.au|co\.jp|com\.br|ca)$/i,
    price: [
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#corePrice_feature_div .a-price .a-offscreen',
      '#tp_price_block_total_price_ww .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
      '.a-price .a-offscreen',
    ],
    listPrice: ['.basisPrice .a-offscreen', '#listPrice', '.priceBlockStrikePriceString'],
    title: ['#productTitle', 'h1#title span'],
    image: ['#landingImage', '#imgTagWrapperId img', '#main-image'],
    outOfStock: ['#outOfStock', '#availability .a-color-price'],
    canonical(url) {
      const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
      return m ? `${url.origin}/dp/${m[1].toUpperCase()}` : null;
    },
    isProductPage(url) {
      return /\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}/i.test(url.pathname);
    },
  },

  {
    id: 'flipkart',
    label: 'Flipkart',
    match: /(^|\.)flipkart\.com$/i,
    // Flipkart's class names are build hashes. These are the ones current at time
    // of writing; the generic heuristic in extract.js is the real safety net.
    price: ['div.Nx9bqj.CxhGGd', 'div._30jeq3._16Jk6d', 'div._30jeq3'],
    listPrice: ['div.yRaY8j', 'div._3I9_wc._2p6lqe'],
    title: ['span.VU-ZEz', 'h1 span.B_NuCI', 'h1'],
    image: ['img._396cs4', 'img.DByuf4', 'div._3kidJX img'],
    canonical(url) {
      const pid = url.searchParams.get('pid');
      if (!pid) return null;
      return `${url.origin}${url.pathname}?pid=${pid}`;
    },
    isProductPage(url) {
      return url.pathname.includes('/p/') && url.searchParams.has('pid');
    },
  },

  {
    id: 'myntra',
    label: 'Myntra',
    match: /(^|\.)myntra\.com$/i,
    price: ['.pdp-price strong', '.pdp-price', 'span.pdp-price'],
    listPrice: ['.pdp-mrp s', '.pdp-mrp'],
    title: ['h1.pdp-title', 'h1.pdp-name'],
    image: ['.image-grid-image', '.common-image'],
    canonical(url) {
      const m = url.pathname.match(/\/(\d+)\/buy\/?$/);
      return m ? `${url.origin}${url.pathname.replace(/\/$/, '')}` : null;
    },
    isProductPage(url) {
      return /\/\d+\/buy\/?$/.test(url.pathname);
    },
  },

  {
    id: 'ajio',
    label: 'AJIO',
    match: /(^|\.)ajio\.com$/i,
    price: ['.prod-sp', '.price-value'],
    listPrice: ['.prod-cp'],
    title: ['h1.prod-name', '.prod-name'],
    image: ['.img-swipe img', '.rilrtl-lazy-img'],
    isProductPage(url) {
      return url.pathname.includes('/p/');
    },
  },

  {
    id: 'croma',
    label: 'Croma',
    match: /(^|\.)croma\.com$/i,
    price: ['span.amount', '.pdp-price .amount'],
    listPrice: ['span.old-price', '.pdp-price .strike'],
    title: ['h1.pd-title', 'h1'],
    image: ['.pd-image img', '#0prodImg'],
    isProductPage(url) {
      return /\/p\/\d+/.test(url.pathname);
    },
  },

  {
    id: 'reliancedigital',
    label: 'Reliance Digital',
    match: /(^|\.)reliancedigital\.in$/i,
    price: ['.pdp__offerPrice', 'span.TextWeb__Text-sc-1cyx778-0.gRHDLW'],
    listPrice: ['.pdp__mrpPrice'],
    title: ['h1.pdp__title', 'h1'],
    image: ['.pdp__imgCont img'],
    isProductPage(url) {
      return url.pathname.includes('/product/') || /\/\d+\/?$/.test(url.pathname);
    },
  },

  {
    id: 'nykaa',
    label: 'Nykaa',
    match: /(^|\.)nykaa\.com$/i,
    price: ['span.css-1jczs19', '.product-price .post-card__content-price-offer'],
    title: ['h1.css-1gc4x7i', 'h1'],
    image: ['.css-1p4vsonimg', '.product-image img'],
    isProductPage(url) {
      return url.pathname.includes('/p/');
    },
  },

  {
    id: 'tatacliq',
    label: 'Tata CLiQ',
    match: /(^|\.)tatacliq\.com$/i,
    price: ['.ProductDetailsMainCard__price', 'h3.ProductDetailsMainCard__price'],
    listPrice: ['.ProductDetailsMainCard__priceStrike'],
    title: ['h1.ProductDetailsMainCard__productName', 'h1'],
    image: ['.ProductGalleryMobile__image img', '.Slider__image img'],
    isProductPage(url) {
      return url.pathname.includes('/p-');
    },
  },

  {
    id: 'meesho',
    label: 'Meesho',
    match: /(^|\.)meesho\.com$/i,
    price: ['h4.sc-eDvSVe', 'h4[class*="ProductDetails"]'],
    title: ['span.sc-eDvSVe.bMKvcF', 'h1'],
    image: ['div[class*="ProductDetails"] img'],
    isProductPage(url) {
      return url.pathname.includes('/p/');
    },
  },
];

/** Find the selector pack for a URL, or null for unsupported/unknown sites. */
export function sitePackFor(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  return SITE_PACKS.find((pack) => pack.match.test(url.hostname)) || null;
}

/**
 * Produce a stable identity URL: strips tracking noise so the same product
 * opened from search, an ad, and a share link all collapse to one entry.
 */
export function canonicalizeUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return urlString;
  }

  const pack = SITE_PACKS.find((p) => p.match.test(url.hostname));
  if (pack?.canonical) {
    const specific = pack.canonical(url);
    if (specific) return specific;
  }

  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  url.hash = '';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  return url.toString();
}

/** Cheap heuristic for "does this page look like a single product?" */
export function looksLikeProductPage(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  const pack = SITE_PACKS.find((p) => p.match.test(url.hostname));
  if (pack?.isProductPage) return pack.isProductPage(url);
  return /\/(p|dp|product|item|buy)\//i.test(url.pathname);
}

/** Short, human-readable source name for the UI. */
export function siteLabel(urlString) {
  const pack = sitePackFor(urlString);
  if (pack) return pack.label;
  try {
    return new URL(urlString).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}
