import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { buildPriceSnippet, extractProduct, inferCurrencyFromUrl } from '../src/extract.js';

// extract.js consults Node.DOCUMENT_POSITION_FOLLOWING in the heuristic rung.
before(() => {
  globalThis.Node = new JSDOM('').window.Node;
});

const parse = (html) => new JSDOM(html).window.document;

test('rung 1: JSON-LD with @graph and AggregateOffer', () => {
  const doc = parse(`<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"BreadcrumbList","itemListElement":[]},
      {"@type":"Product","name":"Sony WH-1000XM5","image":["https://cdn.x/img.jpg"],
       "offers":{"@type":"AggregateOffer","lowPrice":"26990.00","priceCurrency":"INR",
                 "availability":"https://schema.org/InStock"}}]}</script>
    </head><body><h1>Sony WH-1000XM5</h1><s>₹34,990</s></body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09XS7JWHH?ref=sr_1_1');

  assert.equal(result.ok, true);
  assert.equal(result.price, 26990);
  assert.equal(result.currency, 'INR');
  assert.equal(result.title, 'Sony WH-1000XM5');
  assert.equal(result.image, 'https://cdn.x/img.jpg');
  assert.equal(result.inStock, true);
  assert.equal(result.strategy, 'jsonld');
  assert.equal(result.canonicalUrl, 'https://www.amazon.in/dp/B09XS7JWHH');
});

test('rung 1: out-of-stock availability is respected', () => {
  const doc = parse(`<script type="application/ld+json">{"@type":"Product","name":"X",
    "offers":{"price":"1999","priceCurrency":"INR","availability":"http://schema.org/OutOfStock"}}</script>`);

  const result = extractProduct(doc, 'https://www.croma.com/p/12345');
  assert.equal(result.ok, true);
  assert.equal(result.inStock, false);
});

test('rung 2: meta tags, with relative images resolved against the page URL', () => {
  const doc = parse(`<html><head>
    <meta property="og:title" content="Nike Air Max">
    <meta property="product:price:amount" content="7495.00">
    <meta property="product:price:currency" content="INR">
    <meta property="og:image" content="/img/shoe.png">
    </head><body><h1>Nike Air Max</h1></body></html>`);

  const result = extractProduct(doc, 'https://www.myntra.com/shoes/nike/x/998877/buy');

  assert.equal(result.price, 7495);
  assert.equal(result.strategy, 'meta');
  assert.equal(result.image, 'https://www.myntra.com/img/shoe.png');
});

test('rung 3: Amazon selector pack picks the selling price, not the basis price', () => {
  const doc = parse(`<html><body>
    <span id="productTitle">Echo Dot (5th Gen)</span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price"><span class="a-offscreen">₹4,499</span></span>
    </div>
    <span class="basisPrice"><span class="a-offscreen">₹5,499</span></span>
    <img id="landingImage" src="https://m.media-amazon.com/echo.jpg">
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09B8X9RGM');

  assert.equal(result.price, 4499);
  assert.equal(result.title, 'Echo Dot (5th Gen)');
  assert.equal(result.strategy, 'selector');
});

test('rung 4: heuristic beats strikethrough MRP, EMI and savings figures', () => {
  const doc = parse(`<html><body><h1>Generic Kettle</h1>
    <div><s><span>₹2,499</span></s></div>
    <div class="selling-price"><span>₹1,299</span></div>
    <div><span>You save ₹1,200</span></div>
    <div><span>EMI from ₹63/month</span></div>
    </body></html>`);

  const result = extractProduct(doc, 'https://shop.example.com/product/kettle');

  assert.equal(result.ok, true);
  assert.equal(result.price, 1299);
  assert.equal(result.strategy, 'heuristic');
});

test('malformed JSON-LD does not throw and falls through to the next rung', () => {
  const doc = parse(`<script type="application/ld+json">{ this is not json }</script>
    <meta property="og:price:amount" content="₹899">`);

  const result = extractProduct(doc, 'https://shop.example.com/p/x');
  assert.equal(result.price, 899);
});

test('a page with no price reports failure rather than guessing', () => {
  const doc = parse('<html><body><h1>About us</h1><p>We sell things.</p></body></html>');
  const result = extractProduct(doc, 'https://shop.example.com/about');

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-price');
  // Title and canonical URL are still useful to the caller.
  assert.equal(result.title, 'About us');
});

test('an empty leading selector does not defeat the rest of the pack', () => {
  // The real amazon.in shape, and the cause of the wrong prices. Amazon ships
  // `#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen` PRESENT and
  // EMPTY. fromSelectors used to take the first matching *element* and give up
  // when its text did not parse, so rung 4 always failed on Amazon and handed the
  // page to the guessing rung — even though a later selector holds the price.
  // Amazon publishes no JSON-LD and no og:price, so rung 4 is its only reliable
  // reader.
  const doc = parse(`<html><body><h1>Pack of 4</h1>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="priceToPay"><span class="a-offscreen"></span></span>
    </div>
    <div id="corePrice_feature_div">
      <span class="a-price"><span class="a-offscreen">₹349.00</span></span>
    </div>
    <div><span>₹94.75</span><span>per count</span></div>
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09SGFGPM9');

  assert.equal(result.price, 349);
  assert.equal(result.strategy, 'selector');
});

test('the pack still reads correctly with no layout at all', () => {
  // The `fetch` path. This is what previously fell through to the guesser.
  const doc = parseUnrendered(`<html><body><h1>Pack of 4</h1>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="priceToPay"><span class="a-offscreen"></span></span>
    </div>
    <div id="corePrice_feature_div">
      <span class="a-price"><span class="a-offscreen">₹349.00</span></span>
    </div>
    <div><span>₹8.75</span></div>
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09SGFGPM9');

  assert.equal(result.price, 349);
  assert.equal(result.strategy, 'selector');
});

test('a selector list with nothing parseable still falls through', () => {
  // Guard against over-correcting: if no selector yields a price the rung must
  // still decline so the ladder can continue.
  const doc = parse(`<html><body><h1>Kettle</h1>
    <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">Currently unavailable</span></span></div>
    <meta property="product:price:amount" content="1299">
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09SGFGPM8');

  assert.equal(result.price, 1299);
  assert.equal(result.strategy, 'meta');
});

test('a learned selector takes priority over the built-in site pack', () => {
  const doc = parse(`<html><body>
    <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">₹4,499</span></div>
    <div class="new-layout-price">₹3,999</div>
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09B8X9RGM', {
    learnedSelector: '.new-layout-price',
  });

  assert.equal(result.price, 3999);
  assert.equal(result.strategy, 'learned');
});

// ---------------------------------------------------------------------------
// Unrendered documents — the offscreen / `fetch` path
//
// Regression cover for a real incident. A pack-of-4 listed at ₹349 was recorded
// as ₹94.75 and then ₹8.75 on consecutive `fetch` checks, while `page-visit`
// readings from the same page were correct throughout. Two compounding causes:
//
//   1. The heuristic's strongest signals (font size, line-through) come from
//      getComputedStyle, which is unreachable on a DOMParser document. They
//      evaluated to zero instead of failing, collapsing every score into a tie.
//   2. The tie-break was `|| a.value - b.value` — ascending — so a tie returned
//      the cheapest currency-shaped string on the page.
//
// Together those guaranteed an underestimate on every unrendered check, which
// the alert layer then announced as a price drop.
// ---------------------------------------------------------------------------

/** Mirrors offscreen.js: a parsed document has no browsing context. */
const parseUnrendered = (html) =>
  new (new JSDOM('').window.DOMParser)().parseFromString(html, 'text/html');

test('an unrendered document really does lack a browsing context', () => {
  // If this ever fails the two tests below are silently not testing anything.
  assert.equal(parseUnrendered('<body></body>').defaultView, null);
});

test('unrendered + ambiguous candidates declines rather than picking the cheapest', () => {
  const doc = parseUnrendered(`<html><body><h1>Toilet Seat Lifter (Pack of 4)</h1>
    <div><span>₹349</span></div>
    <div><span>₹94.75</span></div>
    <div><span>₹8.75</span></div>
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09SGFGPM9');

  // Declining lets the checker escalate to a real tab, which has layout.
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-price');
});

test('the same page rendered reads the real price', () => {
  const doc = parse(`<html><body><h1>Toilet Seat Lifter (Pack of 4)</h1>
    <div class="selling-price"><span style="font-size:28px">₹349</span></div>
    <div><span style="font-size:11px">₹94.75 per count</span></div>
    </body></html>`);

  const result = extractProduct(doc, 'https://www.amazon.in/dp/B09SGFGPM9');

  assert.equal(result.price, 349);
  assert.equal(result.strategy, 'heuristic');
});

test('a per-unit price never outranks the pack price', () => {
  const doc = parse(`<html><body><h1>Pack of 4</h1>
    <div><span>₹379</span></div>
    <div><span>₹94.75</span><span>per count</span></div>
    </body></html>`);

  assert.equal(extractProduct(doc, 'https://shop.example.com/p/1').price, 379);
});

test('an unrendered document still reads structured data happily', () => {
  // Declining above must not have broken the rungs that do work without layout —
  // JSON-LD and meta are exactly how server-side extraction is meant to work.
  const doc = parseUnrendered(`<html><head>
    <script type="application/ld+json">{"@type":"Product","name":"Kettle",
      "offers":{"@type":"Offer","price":"1299","priceCurrency":"INR"}}</script>
    </head><body><h1>Kettle</h1><span>₹63</span></body></html>`);

  const result = extractProduct(doc, 'https://shop.example.com/p/kettle');

  assert.equal(result.price, 1299);
  assert.equal(result.strategy, 'jsonld');
});

test('a repeated price is agreement, not ambiguity', () => {
  // The same figure rendered twice must not read as an unresolvable tie.
  const doc = parseUnrendered(`<html><body><h1>Kettle</h1>
    <div><span>₹1,299</span></div>
    <div><span>₹1,299</span></div>
    </body></html>`);

  const result = extractProduct(doc, 'https://shop.example.com/p/kettle');

  assert.equal(result.ok, true);
  assert.equal(result.price, 1299);
  assert.equal(result.strategy, 'heuristic-blind');
});

test('buildPriceSnippet stays small and keeps the real candidates', () => {
  const doc = parse(`<html><body><h1>Generic Kettle</h1>
    <div><s><span>₹2,499</span></s></div>
    <div class="selling-price"><span>₹1,299</span></div>
    ${'<p>filler text with no price at all</p>'.repeat(400)}
    </body></html>`);

  const snippet = buildPriceSnippet(doc);

  assert.match(snippet, /TITLE: Generic Kettle/);
  assert.match(snippet, /₹1,299/);
  // The whole point is that a 2 MB page becomes a couple of KB.
  assert.ok(snippet.length < 2000, `snippet was ${snippet.length} chars`);
});

test('inferCurrencyFromUrl maps domain TLDs correctly', () => {
  assert.equal(inferCurrencyFromUrl('https://www.amazon.in/dp/B09XS7JWHH'), 'INR');
  assert.equal(inferCurrencyFromUrl('https://www.amazon.com/dp/B09XS7JWHH'), 'USD');
  assert.equal(inferCurrencyFromUrl('https://www.amazon.co.uk/dp/B09XS7JWHH'), 'GBP');
  assert.equal(inferCurrencyFromUrl('https://www.amazon.de/dp/B09XS7JWHH'), 'EUR');
  assert.equal(inferCurrencyFromUrl('https://www.amazon.com.au/dp/B09XS7JWHH'), 'AUD');
  assert.equal(inferCurrencyFromUrl('https://unknown-shop.xyz/p/1'), 'INR');
});

test('extractProduct uses TLD fallback currency when no currency symbol is provided in markup', () => {
  const doc = parse(`<html><head><title>Item</title><meta property="product:price:amount" content="49.99"></head><body><h1>Wireless Mouse</h1></body></html>`);
  const result = extractProduct(doc, 'https://www.amazon.co.uk/dp/B09XS7JWHH');
  assert.equal(result.ok, true);
  assert.equal(result.price, 49.99);
  assert.equal(result.currency, 'GBP');
});

