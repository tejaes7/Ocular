import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePrice } from '../src/extract.js';
import { money } from '../src/format.js';
import { canonicalizeUrl, looksLikeProductPage, siteLabel } from '../src/sites.js';

test('money helper formats currencies with appropriate locales', () => {
  assert.equal(money(129999, 'INR'), '₹1,29,999');
  assert.equal(money(129999, 'USD'), '$129,999');
  assert.equal(money(129999.5, 'USD'), '$129,999.50');
});

test('parsePrice handles Indian lakh grouping', () => {
  assert.deepEqual(parsePrice('₹1,29,999'), { value: 129999, currency: 'INR' });
  assert.deepEqual(parsePrice('₹1,29,999.50'), { value: 129999.5, currency: 'INR' });
  assert.deepEqual(parsePrice('MRP: ₹2,00,000'), { value: 200000, currency: 'INR' });
});

test('parsePrice handles Western and European grouping', () => {
  assert.deepEqual(parsePrice('$1,299.00'), { value: 1299, currency: 'USD' });
  assert.deepEqual(parsePrice('1.299,00 €'), { value: 1299, currency: 'EUR' });
  assert.deepEqual(parsePrice('£29.99'), { value: 29.99, currency: 'GBP' });
});

test('parsePrice distinguishes decimal separator from thousands separator', () => {
  // Three trailing digits can only be grouping.
  assert.equal(parsePrice('₹1,000').value, 1000);
  assert.equal(parsePrice('1,000').value, 1000);
  // One or two trailing digits are a decimal fraction.
  assert.equal(parsePrice('9.99').value, 9.99);
  assert.equal(parsePrice('9,5').value, 9.5);
});

test('parsePrice recognises rupee spellings', () => {
  assert.deepEqual(parsePrice('Rs. 4,999'), { value: 4999, currency: 'INR' });
  assert.deepEqual(parsePrice('INR 749'), { value: 749, currency: 'INR' });
  assert.equal(parsePrice('  ₹ 2,499  ').value, 2499);
});

test('parsePrice accepts numbers and rejects junk', () => {
  assert.deepEqual(parsePrice(24999), { value: 24999, currency: null });
  for (const bad of [null, undefined, '', 'Free', 'Out of stock', 'abc', {}, NaN]) {
    assert.equal(parsePrice(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('parsePrice rejects zero and negative values', () => {
  assert.equal(parsePrice('₹0'), null);
  assert.equal(parsePrice(-50), null);
});

test('canonicalizeUrl reduces Amazon URLs to /dp/ASIN', () => {
  assert.equal(
    canonicalizeUrl('https://www.amazon.in/Sony-Headphones/dp/B0863TXGM3/ref=sr_1_3?qid=1&tag=aff'),
    'https://www.amazon.in/dp/B0863TXGM3'
  );
  // Same product reached three different ways collapses to one identity.
  assert.equal(
    canonicalizeUrl('https://www.amazon.in/gp/product/b0863txgm3?psc=1'),
    'https://www.amazon.in/dp/B0863TXGM3'
  );
});

test('canonicalizeUrl keeps the Flipkart pid and drops tracking noise', () => {
  assert.equal(
    canonicalizeUrl('https://www.flipkart.com/apple-iphone-15/p/itm6ac?pid=MOBGTAGPAQ&lid=LST1&marketplace=FLIPKART'),
    'https://www.flipkart.com/apple-iphone-15/p/itm6ac?pid=MOBGTAGPAQ'
  );
});

test('canonicalizeUrl strips utm params on unknown sites', () => {
  assert.equal(
    canonicalizeUrl('https://shop.example.com/p/kettle?utm_source=x&utm_campaign=y&size=large#reviews'),
    'https://shop.example.com/p/kettle?size=large'
  );
});

test('canonicalizeUrl survives malformed input', () => {
  assert.equal(canonicalizeUrl('not a url'), 'not a url');
});

test('looksLikeProductPage separates products from search pages', () => {
  const cases = [
    ['https://www.amazon.in/dp/B0863TXGM3', true],
    ['https://www.amazon.in/s?k=headphones', false],
    ['https://www.flipkart.com/x/p/itm123?pid=ABC', true],
    ['https://www.flipkart.com/search?q=phone', false],
    ['https://www.myntra.com/tshirts/nike/x/12345678/buy', true],
    ['https://www.myntra.com/tshirts', false],
    ['https://www.croma.com/p/123456', true],
  ];
  for (const [url, expected] of cases) {
    assert.equal(looksLikeProductPage(url), expected, url);
  }
});

test('siteLabel names known stores and falls back to the hostname', () => {
  assert.equal(siteLabel('https://www.amazon.in/dp/B0863TXGM3'), 'Amazon');
  assert.equal(siteLabel('https://www.flipkart.com/x/p/y?pid=1'), 'Flipkart');
  assert.equal(siteLabel('https://shop.example.com/p/x'), 'shop.example.com');
});
test('canonicalizeUrl collapses repeated slashes', () => {
  assert.equal(
    canonicalizeUrl('https://example.com//product///phone////'),
    'https://example.com/product/phone'
  );
});
