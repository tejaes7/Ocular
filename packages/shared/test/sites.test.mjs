/**
 * Site pack behaviour, plus one guard against a bug that was invisible in code
 * review because the two halves of it lived in different packages.
 *
 * The landing page advertised sixteen retailers; `SITE_PACKS` and the manifest
 * knew about nine. Nothing failed — the extension simply never loaded on the
 * other seven, so the button never appeared and a user who went to Nike because
 * the site said Nike was supported got nothing, with no error to report. Neither
 * file is wrong on its own, which is precisely why this needs a test rather than
 * a careful reader.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { SITE_PACKS, canonicalizeUrl, looksLikeProductPage, sitePackFor } from '../src/sites.js';

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

test('every advertised store has a site pack', () => {
  const storesBar = read('../../web/src/components/StoresBar.jsx');

  // The store list is a literal array of `name:` fields. Parsing it beats
  // importing the component, which would drag in React, Vite asset imports and
  // framer-motion for the sake of one array. Scoped to the array literal so a
  // `name:` elsewhere in the file cannot be read as a supported retailer.
  const list = storesBar.slice(storesBar.indexOf('const stores = ['));
  const advertised = [...list.slice(0, list.indexOf('\n];')).matchAll(/\bname: '([^']+)'/g)].map(
    (m) => m[1]
  );

  assert.ok(advertised.length >= 10, `expected to parse the store list, got ${advertised.length}`);

  const supported = new Set(SITE_PACKS.map((pack) => pack.label.toLowerCase()));
  const missing = advertised.filter((name) => !supported.has(name.toLowerCase()));

  assert.deepEqual(
    missing,
    [],
    `The landing page advertises ${missing.join(', ')} but sites.js has no pack for them. ` +
      'Either add the pack (and a manifest match) or take the store off the page.'
  );
});

test('every site pack is reachable from the extension manifest', () => {
  const manifest = JSON.parse(read('../../extension/src/manifest.json'));
  const matches = manifest.content_scripts[0].matches;

  // A pack with no manifest match is dead code: the content script never runs on
  // that host, so nothing ever consults the pack.
  const hosts = matches.map((pattern) => new URL(pattern.replace(/\*$/, '')).hostname);

  for (const pack of SITE_PACKS) {
    const covered = hosts.some((host) => pack.match.test(host));
    assert.ok(covered, `sites.js has a '${pack.id}' pack but no manifest match reaches it`);
  }
});

test('manifest host_permissions and content_scripts stay in step', () => {
  const manifest = JSON.parse(read('../../extension/src/manifest.json'));
  assert.deepEqual(
    [...manifest.content_scripts[0].matches].sort(),
    [...manifest.host_permissions].sort()
  );
});

test('canonicalisation collapses the same product to one identity', () => {
  const cases = [
    [
      'https://www.snapdeal.com/product/some-long-marketing-slug/628374912?utm_source=x',
      'https://www.snapdeal.com/product/other-slug/628374912',
    ],
    [
      'https://www.bigbasket.com/pd/40012345/fresh-tomatoes-1kg/?tag=deal',
      'https://www.bigbasket.com/pd/40012345/tomatoes/',
    ],
    [
      'https://www.decathlon.in/p/running-shoes/_/R-p-309876',
      'https://www.decathlon.in/p/mens-running-shoes-blue/_/R-p-309876',
    ],
  ];

  for (const [a, b] of cases) {
    assert.equal(canonicalizeUrl(a), canonicalizeUrl(b), `${a} and ${b} should canonicalise alike`);
  }
});

test('canonicalisation keeps different products apart', () => {
  assert.notEqual(
    canonicalizeUrl('https://www.snapdeal.com/product/slug/628374912'),
    canonicalizeUrl('https://www.snapdeal.com/product/slug/628374913')
  );
  assert.notEqual(
    canonicalizeUrl('https://www.adidas.co.in/shoe/IE1234.html'),
    canonicalizeUrl('https://www.adidas.co.in/shoe/IE1235.html')
  );
});

test('product pages are recognised on the newly added stores', () => {
  const productPages = [
    'https://www.snapdeal.com/product/slug/628374912',
    'https://www.bigbasket.com/pd/40012345/tomatoes/',
    'https://www.jiomart.com/p/groceries/some-item/491234567',
    'https://www.nike.com/in/t/air-max-90-shoes/CN8490-100',
    'https://www.adidas.co.in/ultraboost-light/IE1234.html',
    'https://in.puma.com/in/en/pd/suede-classic/398765',
    'https://www.decathlon.in/p/running-shoes/_/R-p-309876',
  ];

  for (const url of productPages) {
    assert.ok(sitePackFor(url), `no pack matched ${url}`);
    assert.ok(looksLikeProductPage(url), `${url} should look like a product page`);
  }
});

test('listing and home pages are not mistaken for products', () => {
  const notProducts = [
    'https://www.snapdeal.com/products/mens-footwear',
    'https://www.bigbasket.com/cl/fruits-vegetables/',
    'https://www.nike.com/in/w/mens-shoes',
    'https://www.adidas.co.in/men-shoes',
  ];

  for (const url of notProducts) {
    assert.equal(looksLikeProductPage(url), false, `${url} should not look like a product page`);
  }
});
