import React, { useLayoutEffect, useRef } from 'react';
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
 *
 * Each piece is a positioned <span> wrapping an <img>, which looks like one
 * element too many until you notice there are two animations here: the entry
 * flies outward from the headline, and the float runs forever afterwards. Both
 * are transforms, and one element can only hold one `transform` — the second
 * declaration would simply replace the first. The wrapper owns the entry, the
 * image owns the float, and they compose instead of fighting.
 */

/**
 * Fallback origin, as a fraction of the layer, for the case where the headline
 * cannot be found. The real origin is measured off the <h1> itself — see
 * `originOf` — so that "out from behind the word Ocular" keeps meaning that if
 * the headline ever moves or changes size.
 */
const ORIGIN_FALLBACK = { x: 0.5, y: 0.36 };

/**
 * Centre of the "Ocular" headline, in the layer's coordinates.
 *
 * The <h1> and this layer are both children of the hero card, and the card is
 * the positioned ancestor of each, so their offset values already share a
 * coordinate space; subtracting the layer's own offset is enough to line them
 * up. offsetTop is used rather than a rect because the headline is a motion.h1
 * carrying an entry transform of its own, and offsets ignore transforms.
 */
function originOf(layer) {
  const headline = layer.parentElement?.querySelector('h1');

  if (!headline) {
    return {
      x: layer.offsetWidth * ORIGIN_FALLBACK.x,
      y: layer.offsetHeight * ORIGIN_FALLBACK.y,
    };
  }

  return {
    x: headline.offsetLeft + headline.offsetWidth / 2 - layer.offsetLeft,
    y: headline.offsetTop + headline.offsetHeight / 2 - layer.offsetTop,
  };
}

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
  const layerRef = useRef(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    /**
     * Write each piece's vector back to the headline.
     *
     * offsetLeft/offsetTop rather than getBoundingClientRect: these are layout
     * values, unaffected by the transforms this effect is about to write, so
     * there is no measure-then-clobber ordering to get wrong. Centres are also
     * rotation-invariant, so the tilt on each piece does not skew them.
     *
     * Returns false when the layer has no size yet — below `sm` it is
     * display:none, and during a cold load the geometry can be measured before
     * the stylesheet lands. Placing against a zero-width layer silently yields
     * a zero vector for every piece, which looks like a plain fade with the
     * travel mysteriously missing.
     */
    const place = () => {
      layer.dataset.probe = `${(layer.dataset.probe || '')}|${layer.offsetWidth}`;
      if (!layer.offsetWidth) return false;

      const origin = originOf(layer);

      for (const el of layer.children) {
        el.style.setProperty('--dx', `${origin.x - (el.offsetLeft + el.offsetWidth / 2)}px`);
        el.style.setProperty('--dy', `${origin.y - (el.offsetTop + el.offsetHeight / 2)}px`);
      }

      return true;
    };

    /**
     * Adding the class starts a keyframe animation, not a transition.
     *
     * A transition only runs if the browser has a committed "before" style to
     * move away from, and this reveal happens in a layout effect — before the
     * first paint — where that snapshot may not exist. When it does not, the
     * transition is skipped and the pieces simply appear at rest: the fade
     * survives but the travel silently vanishes. An animation carries its own
     * start state in the 0% keyframe, so it does not depend on that history and
     * needs no forced-reflow trick to fire.
     */
    const reveal = () => {
      if (layer.classList.contains('is-ready') || !place()) return;
      layer.classList.add('is-ready');
    };

    reveal();

    // The images size their own wrappers, so until they decode the geometry is
    // provisional. Any that were still loading get a second attempt.
    const pending = [...layer.querySelectorAll('img')].filter((img) => !img.complete);
    pending.forEach((img) => img.addEventListener('load', reveal, { once: true }));

    // Covers the cold-load case above, and the layer crossing the `sm`
    // breakpoint from display:none into view.
    const observer = new ResizeObserver(reveal);
    observer.observe(layer);

    return () => {
      observer.disconnect();
      pending.forEach((img) => img.removeEventListener('load', reveal));
    };
  }, []);

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="hero-doodles pointer-events-none absolute inset-0 hidden sm:block overflow-hidden"
    >
      {ITEMS.map(({ src, style, rotate, opacity }, i) => (
        // `key` is passed directly rather than spread: React 19 warns when a
        // spread object carries one, because it cannot tell a key from a prop.
        //
        // The stagger and the float period are both derived from the index, so
        // the five pieces never move in lockstep — five identical periods read
        // as one mechanism ticking, which is the distracting version of this.
        <span
          key={i}
          className="hero-doodle"
          style={{
            ...style,
            position: 'absolute',
            '--rot': `${rotate}deg`,
            '--to-opacity': opacity,
            '--delay': `${i * 90}ms`,
            '--float-dur': `${7 + i * 1.3}s`,
          }}
        >
          <img
            className="hero-doodle__img"
            src={src}
            alt=""
            draggable={false}
            // Not loading="lazy". The hero is the top of the page, so these are
            // inside the first viewport — lazy buys nothing there and defers work
            // that is 65KB in total. `decoding="async"` is the hint that actually
            // applies: nothing here should hold up the headline.
            decoding="async"
          />
        </span>
      ))}
    </div>
  );
}
