import React from 'react';
import cartUrl from '../assets/hero/cart.png';
import laptopUrl from '../assets/hero/laptop.webp';
import iphoneUrl from '../assets/hero/iphone.webp';
import samsungUrl from '../assets/hero/samsung.webp';
import headphonesUrl from '../assets/hero/headphones.webp';

/**
 * Product artwork scattered behind the hero copy.
 *
 * Everything here is depth, not subject: it sits under the h1, the strapline and
 * the paste-link form, so each piece is held at partial opacity and kept out of
 * the centre column. Anything that competes with the headline is too strong.
 *
 * Assets are trimmed to their alpha bounding box and capped at 400px on the long
 * edge — 2x the widest `width` below — then encoded as WebP. The four device
 * renders arrived as 8.5MB of PNG between them for artwork that draws at 78-160px;
 * as WebP they total 65KB. If you add one, put it through the same treatment
 * rather than dropping the original in: a 4000px source is ~20x the pixels this
 * layer can show.
 *
 * Hidden below `sm`: on a phone the panel is too narrow for anything behind the
 * copy to be depth rather than clutter.
 */

/**
 * Positions are in the two side gutters only — the copy column sits at roughly
 * 26%-74% of the card, so nothing here crosses 24% or 82%.
 *
 * Sizes are deliberately unequal. Five objects at one size reads as a row of
 * icons; the cart anchors the left corner and everything else is secondary to
 * it. Opacity drops as the artwork gets busier: the cart is a flat illustration
 * and survives 0.45, the device photographs are high-contrast and start to
 * compete with the headline much above 0.35.
 */
const ITEMS = [
  // Left gutter: the cart anchors the bottom corner, the laptop clears its top
  // edge. They meet only where the cart render is transparent.
  { src: cartUrl, style: { left: '0%', bottom: '-8%', width: 210 }, rotate: -4, opacity: 0.45 },
  { src: laptopUrl, style: { left: '13%', top: '6%', width: 130 }, rotate: -7, opacity: 0.34 },

  // Right gutter. The Samsung is bled off the edge so it reads as background
  // rather than a third framed object stacked between the other two.
  { src: iphoneUrl, style: { right: '5%', top: '9%', width: 74 }, rotate: 12, opacity: 0.38 },
  { src: samsungUrl, style: { right: '-3%', top: '45%', width: 110 }, rotate: 8, opacity: 0.26 },
  { src: headphonesUrl, style: { right: '9%', bottom: '6%', width: 108 }, rotate: -10, opacity: 0.36 },
];

export default function HeroDoodles() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden sm:block overflow-hidden"
    >
      {ITEMS.map(({ src, style, rotate, opacity }, i) => (
        // `key` is passed directly rather than spread: React 19 warns when a
        // spread object carries one, because it cannot tell a key from a prop.
        <img
          key={i}
          src={src}
          alt=""
          draggable={false}
          // Not loading="lazy". The hero is the top of the page, so these are
          // inside the first viewport — lazy buys nothing there and defers work
          // that is 65KB in total. `decoding="async"` is the hint that actually
          // applies: nothing here should hold up the headline.
          decoding="async"
          style={{ ...style, position: 'absolute', transform: `rotate(${rotate}deg)`, opacity }}
        />
      ))}
    </div>
  );
}
