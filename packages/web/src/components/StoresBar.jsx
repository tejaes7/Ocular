import React from 'react';
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

const stores = [
  {
    name: 'Amazon',
    logo: amazonLogo,
    logoClass: 'h-10',
  },
  {
    name: 'Flipkart',
    logo: flipkartLogo,
    logoClass: 'h-10',
  },
  {
    name: 'Myntra',
    logo: myntraLogo,
    logoClass: 'h-10',
  },
  {
    // The only Meesho logo on Commons is the square app-tile version, so this one
    // is near 1:1 where every other mark is ~3:1 wide.
    name: 'Meesho',
    logo: meeshoLogo,
    logoClass: 'h-11',
  },
  {
    // Commons has no AJIO logo at all — only unrelated event photography — so this
    // stays a wordmark until someone supplies the official asset.
    name: 'Ajio',
    wordmark: 'AJIO',
  },
  {
    name: 'Nykaa',
    logo: nykaaLogo,
    logoClass: 'h-9',
  },
  {
    name: 'Croma',
    logo: cromaLogo,
    logoClass: 'h-10',
  },
  {
    name: 'Tata CLiQ',
    logo: tataCliqLogo,
    logoClass: 'h-10',
  },
  {
    name: 'Reliance Digital',
    logo: relianceDigitalLogo,
    logoClass: 'h-10',
  },
];

function StoreCard({ store }) {
  return (
    // No backdrop-blur here: the card already has an opaque background, and a
    // backdrop-filter on a permanently moving element costs a backdrop re-sample
    // every frame, times however many cards are on screen.
    <div className="shrink-0 w-44 rounded-2xl theme-bg-card theme-border border shadow-sm p-4 flex flex-col items-center justify-center gap-3 transition-[transform,box-shadow] duration-200 transform-gpu hover:-translate-y-1 hover:shadow-lg">
      <div className="h-12 w-32 flex items-center justify-center overflow-hidden">
        {store.logo ? (
          <img
            src={store.logo}
            alt={`${store.name} logo`}
            className={`w-full object-contain drop-shadow-sm ${store.logoClass || 'h-9'}`}
            loading="lazy"
          />
        ) : (
          <span className="text-sm font-semibold tracking-[0.18em] theme-text-main pl-[0.18em]">
            {store.wordmark}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold theme-text-main">{store.name}</span>
    </div>
  );
}

export default function StoresBar() {
  const track = [...stores, ...stores];

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

      {/* Infinite Sideways Auto-Scrolling Marquee */}
      <div className="overflow-hidden relative z-20">
        <div className="flex gap-4 w-max animate-marquee pl-4 sm:pl-6 lg:pl-8">
          {track.map((store, i) => (
            <StoreCard key={`${store.name}-${i}`} store={store} />
          ))}
        </div>
      </div>
    </motion.section>
  );
}
