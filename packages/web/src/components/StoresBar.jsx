import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
// All logos are self-hosted. They used to be hotlinked from Wikimedia Commons,
// which rate-limits hotlinking (we saw a 429 on Reliance Digital) and leaked every
// visitor's IP to a third party.
import amazonLogo from '../assets/stores/amazon.svg';
import flipkartLogo from '../assets/stores/flipkart.svg';
import myntraLogo from '../assets/stores/myntra.png';
import meeshoLogo from '../assets/stores/meesho.png';
import nykaaLogo from '../assets/stores/nykaa.svg';
import cromaLogo from '../assets/stores/croma.png';
import tataCliqLogo from '../assets/stores/tata-cliq.png';
import relianceDigitalLogo from '../assets/stores/reliance-digital.svg';
import snapdealLogo from '../assets/stores/snapdeal.png';
import bigbasketLogo from '../assets/stores/bigbasket.png';
import jiomartLogo from '../assets/stores/jiomart.svg';
import nikeLogo from '../assets/stores/nike.svg';
import adidasLogo from '../assets/stores/adidas.svg';
import pumaLogo from '../assets/stores/puma.svg';
import decathlonLogo from '../assets/stores/decathlon.svg';

const stores = [
  { name: 'Amazon', url: 'https://www.amazon.in', logo: amazonLogo, logoClass: 'h-10' },
  { name: 'Flipkart', url: 'https://www.flipkart.com', logo: flipkartLogo, logoClass: 'h-10' },
  { name: 'Myntra', url: 'https://www.myntra.com', logo: myntraLogo, logoClass: 'h-10' },
  {
    // The only Meesho logo on Commons is the square app-tile version, so this one
    // is near 1:1 where every other mark is ~3:1 wide.
    name: 'Meesho',
    url: 'https://www.meesho.com',
    logo: meeshoLogo,
    logoClass: 'h-11',
  },
  {
    // Commons has no AJIO logo at all — only unrelated event photography — so this
    // stays a wordmark until someone supplies the official asset.
    name: 'Ajio',
    url: 'https://www.ajio.com',
    wordmark: 'AJIO',
  },
  { name: 'Nykaa', url: 'https://www.nykaa.com', logo: nykaaLogo, logoClass: 'h-9' },
  { name: 'Croma', url: 'https://www.croma.com', logo: cromaLogo, logoClass: 'h-10' },
  { name: 'Tata CLiQ', url: 'https://www.tatacliq.com', logo: tataCliqLogo, logoClass: 'h-10' },
  {
    name: 'Reliance Digital',
    url: 'https://www.reliancedigital.in',
    logo: relianceDigitalLogo,
    logoClass: 'h-10',
  },
  { name: 'Snapdeal', url: 'https://www.snapdeal.com', logo: snapdealLogo, logoClass: 'h-9' },
  { name: 'BigBasket', url: 'https://www.bigbasket.com', logo: bigbasketLogo, logoClass: 'h-9' },
  {
    // Commons only carries JioMart's app icon, not the wordmark, so this one is
    // square like Meesho rather than a wide lockup.
    name: 'JioMart',
    url: 'https://www.jiomart.com',
    logo: jiomartLogo,
    logoClass: 'h-10',
  },
  // Brand-owned stores. These four marks are solid black by design, so the
  // grayscale-to-colour hover is a no-op on them — nothing to desaturate.
  { name: 'Nike', url: 'https://www.nike.com/in', logo: nikeLogo, logoClass: 'h-8' },
  { name: 'Adidas', url: 'https://www.adidas.co.in', logo: adidasLogo, logoClass: 'h-10' },
  { name: 'Puma', url: 'https://in.puma.com', logo: pumaLogo, logoClass: 'h-7' },
  { name: 'Decathlon', url: 'https://www.decathlon.in', logo: decathlonLogo, logoClass: 'h-8' },
];

function StoreCard({ store }) {
  return (
    // No backdrop-blur here: the card already has an opaque background, and a
    // backdrop-filter on a permanently moving element costs a backdrop re-sample
    // every frame, times however many cards are on screen.
    <a
      href={store.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${store.name} in a new tab`}
      // relative + hover:z-10 so a lifted card stacks above its neighbours
      // instead of sliding under the next one along.
      className="group relative z-0 hover:z-10 shrink-0 w-44 rounded-2xl theme-bg-card theme-border border shadow-sm p-4 flex flex-col items-center justify-center gap-3 transition-[transform,box-shadow] duration-200 transform-gpu hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7bb9f2]"
      draggable={false}
    >
      <div className="h-12 w-32 flex items-center justify-center overflow-hidden">
        {store.logo ? (
          <img
            src={store.logo}
            alt={`${store.name} logo`}
            // Desaturated at rest so the strip reads as one texture; full colour
            // on hover. Only `filter` transitions — the card already animates
            // transform and shadow, and `transition-all` would drag those along.
            className={`w-full object-contain drop-shadow-sm grayscale group-hover:grayscale-0 transition-[filter] duration-300 ${store.logoClass || 'h-9'}`}
            loading="lazy"
          />
        ) : (
          <span className="text-sm font-semibold tracking-[0.18em] theme-text-main pl-[0.18em] opacity-60 group-hover:opacity-100 transition-opacity duration-300">
            {store.wordmark}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold theme-text-main">{store.name}</span>
    </a>
  );
}

export default function StoresBar() {
  const track = [...stores, ...stores];
  const railRef = useRef(null);

  // Drag-to-scroll. The rail is a native overflow-x container, so the browser
  // already handles wheel and touch swipe; this only adds pointer dragging for
  // mouse users. CSS pauses the marquee on hover, which is what makes dragging
  // feel stable rather than fighting the animation.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    let dragging = false;
    let startX = 0;
    let startScroll = 0;

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
    };

    const onPointerMove = (event) => {
      if (!dragging) return;
      const delta = event.clientX - startX;
      // Past a few pixels this is a drag, not a click — suppress the card's
      // navigation so dragging across the rail doesn't open a store.
      if (Math.abs(delta) > 4) rail.dataset.dragging = 'true';
      rail.scrollLeft = startScroll - delta;
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      // Cleared on the next frame so the click that follows pointerup still
      // sees the flag.
      requestAnimationFrame(() => delete rail.dataset.dragging);
    };

    const onClickCapture = (event) => {
      if (rail.dataset.dragging === 'true') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    rail.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    rail.addEventListener('click', onClickCapture, true);

    return () => {
      rail.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      rail.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return (
    <motion.section
      id="stores"
      initial={{ opacity: 0, y: 45, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-20 py-10 bg-transparent border-y theme-border transition-colors transform-gpu"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 relative z-20">
        <h3 className="text-xl sm:text-2xl font-semibold theme-accent-text uppercase tracking-wider">
          Supported Stores
        </h3>
      </div>

      {/* Infinite Sideways Auto-Scrolling Marquee.
          overflow-x-auto (not hidden) is what lets the wheel, touch swipe and the
          pointer-drag above move the rail manually. The negative margin plus
          matching padding gives the cards room to lift on hover — with a plain
          overflow container the -translate-y clipped them against the top edge. */}
      <div
        ref={railRef}
        className="stores-rail relative z-30 -my-3 py-3 overflow-x-auto overflow-y-hidden"
      >
        <div className="flex gap-4 w-max animate-marquee pl-4 sm:pl-6 lg:pl-8">
          {track.map((store, i) => (
            <StoreCard key={`${store.name}-${i}`} store={store} />
          ))}
        </div>
      </div>
    </motion.section>
  );
}
