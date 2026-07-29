/**
 * @ocular/shared — logic that must give identical answers in the extension,
 * the backend worker, and the AI service.
 *
 * Rules for this package:
 *   1. **No platform APIs.** No `chrome.*`, no `document` at module scope, no
 *      storage, no `fetch`. Every export is a pure function or takes what it
 *      needs as an argument. That's what lets the same file run in a service
 *      worker, in a Cloudflare Worker, and under `node --test`.
 *   2. **Changes here affect three teams.** See OWNERSHIP.md — edits require
 *      review, because a silent behaviour change desynchronises the extension
 *      from the backend.
 *   3. **Everything is unit tested.** `npm test -w @ocular/shared`.
 */

export { evaluateAlert } from './alerts.js';
export {
  buildPriceSnippet,
  extractProduct,
  flattenJsonLd,
  interpretJsonLd,
  parsePrice,
  PRICE_TEXT_RE,
} from './extract.js';
export { escapeHtml, explainError, money, percentChange, relativeTime } from './format.js';
export { mergeHistory, summarizeHistory } from './history.js';
export { BLOCK_MARKERS, looksBlocked, scanHtml } from './htmlscan.js';
export {
  canonicalizeUrl,
  looksLikeProductPage,
  SITE_PACKS,
  siteLabel,
  sitePackFor,
} from './sites.js';
