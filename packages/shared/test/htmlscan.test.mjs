/**
 * The worker has no DOM, so scanHtml() must reach the same answer as the
 * browser's extractProduct() on the rungs they share. These tests pin that.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { looksBlocked, scanHtml } from '../src/htmlscan.js';

test('scanHtml reads JSON-LD without a DOM', () => {
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Sony WH-1000XM5",
     "image":"https://cdn.x/i.jpg",
     "offers":{"@type":"Offer","price":"26990.00","priceCurrency":"INR",
               "availability":"https://schema.org/InStock"}}
    </script></head><body><h1>Sony WH-1000XM5</h1></body></html>`;

  const result = scanHtml(html, 'https://shop.example.com/p/1');

  assert.equal(result.ok, true);
  assert.equal(result.price, 26990);
  assert.equal(result.currency, 'INR');
  assert.equal(result.inStock, true);
  assert.equal(result.title, 'Sony WH-1000XM5');
  assert.equal(result.strategy, 'jsonld');
});

test('scanHtml unwraps @graph and AggregateOffer', () => {
  const html = `<script type="application/ld+json">{"@graph":[
    {"@type":"WebPage"},
    {"@type":["Product"],"name":"Kettle",
     "offers":{"@type":"AggregateOffer","lowPrice":1299,"priceCurrency":"INR"}}]}</script>`;

  const result = scanHtml(html, 'https://shop.example.com/p/2');
  assert.equal(result.price, 1299);
});

test('scanHtml honours out-of-stock availability', () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"X",
    "offers":{"price":"999","priceCurrency":"INR","availability":"https://schema.org/OutOfStock"}}</script>`;

  assert.equal(scanHtml(html, 'https://x/p/1').inStock, false);
});

test('scanHtml falls back to meta tags', () => {
  const html = `<html><head>
    <meta property="og:title" content="Nike Air Max">
    <meta property="product:price:amount" content="7495.00">
    <meta property="product:price:currency" content="INR">
    </head><body></body></html>`;

  const result = scanHtml(html, 'https://x/p/1');
  assert.equal(result.price, 7495);
  assert.equal(result.currency, 'INR');
  assert.equal(result.strategy, 'meta');
  assert.equal(result.title, 'Nike Air Max');
});

test('scanHtml tolerates reversed meta attribute order', () => {
  const html = `<meta content="4999" property="product:price:amount">`;
  assert.equal(scanHtml(html, 'https://x/p/1').price, 4999);
});

test('scanHtml recognises anti-bot pages before trying to read a price', () => {
  const html = `<html><body><h1>Robot Check</h1>
    <p>Enter the characters you see below</p>
    <script type="application/ld+json">{"@type":"Product","offers":{"price":"1"}}</script>
    </body></html>`;

  const result = scanHtml(html, 'https://www.amazon.in/dp/X');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'blocked', 'a captcha page must not be read as a ₹1 price');
});

test('scanHtml reports no-price rather than guessing', () => {
  const result = scanHtml('<html><body><h1>About us</h1></body></html>', 'https://x/about');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-price');
  assert.equal(result.title, 'About us');
});

test('scanHtml survives malformed JSON-LD and empty input', () => {
  assert.equal(scanHtml('<script type="application/ld+json">{oops}</script>', 'https://x').ok, false);
  assert.equal(scanHtml('', 'https://x').ok, false);
  assert.equal(scanHtml(null, 'https://x').ok, false);
});

test('scanHtml falls back through h1 and <title> for the product name', () => {
  assert.equal(scanHtml('<h1>  Spaced   Name </h1>', 'https://x').title, 'Spaced Name');
  assert.equal(scanHtml('<title>Page Title</title>', 'https://x').title, 'Page Title');
});

test('looksBlocked only inspects the head of the document', () => {
  assert.equal(looksBlocked('<p>Enter the characters you see below</p>'), true);
  // A marker phrase buried far past the head shouldn't condemn a real page.
  assert.equal(looksBlocked(`${'x'.repeat(20000)} access denied`), false);
});
