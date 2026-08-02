import React, { useEffect, useRef } from 'react';

const SPOKES = 8;

/**
 * Ring-and-spokes pulse at the pointer on every click.
 *
 * Built imperatively rather than through React state: a burst is a throwaway
 * DOM node, and routing every click through a re-render would churn the tree for
 * something that never needs reconciling. Each burst removes itself when its CSS
 * animation ends, so nothing accumulates and no rAF loop is left running.
 */
export default function ClickBurst() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    const onPointerDown = (event) => {
      if (reduceMotion?.matches) return;
      // Primary button / touch only — a right-click opening a context menu
      // shouldn't fire a flourish.
      if (event.button !== 0) return;

      const burst = document.createElement('span');
      burst.className = 'ocular-burst';
      burst.style.left = `${event.clientX}px`;
      burst.style.top = `${event.clientY}px`;

      const ring = document.createElement('span');
      ring.className = 'ocular-burst-ring';
      burst.appendChild(ring);

      for (let i = 0; i < SPOKES; i++) {
        const spoke = document.createElement('i');
        spoke.style.setProperty('--angle', `${(360 / SPOKES) * i}deg`);
        burst.appendChild(spoke);
      }

      // The ring is the longest-running animation, so its end is the burst's end.
      ring.addEventListener('animationend', () => burst.remove(), { once: true });
      // Belt and braces: if the tab is backgrounded mid-animation the event may
      // never fire, and an orphaned node would sit in the DOM forever.
      setTimeout(() => burst.remove(), 1000);

      layer.appendChild(burst);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      layer.replaceChildren();
    };
  }, []);

  return <div ref={layerRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]" />;
}
