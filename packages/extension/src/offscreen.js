/**
 * Offscreen document: the service worker's only route to a DOMParser.
 *
 * MV3 service workers have no DOM APIs whatsoever, so HTML fetched by the worker
 * is shipped here, parsed, and returned as structured data.
 */

import { buildPriceSnippet, extractProduct } from '@ocular/shared/extract';

const TARGET = 'ocular-offscreen';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== TARGET) return false;
  if (message.type !== 'parse') return false;

  try {
    const doc = new DOMParser().parseFromString(message.html, 'text/html');
    const result = extractProduct(doc, message.url, {
      learnedSelector: message.learnedSelector,
    });
    // Only built when the deterministic ladder missed — it's the AI fallback's
    // input, and it costs a full DOM walk.
    result.snippet = result.ok ? null : buildPriceSnippet(doc);
    sendResponse(result);
  } catch (error) {
    sendResponse({ ok: false, reason: 'parse-error', error: String(error) });
  }

  return true;
});
