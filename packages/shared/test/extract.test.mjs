import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { buildPriceSnippet, extractProduct } from '../src/extract.js';

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
