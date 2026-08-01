import React from 'react';
import { motion } from 'framer-motion';
import myntraLogo from '../assets/stores/myntra.svg';
import amazonLogo from '../assets/stores/amazon.svg';

const stores = [
  {
    name: 'Amazon',
    logo: amazonLogo,
    logoClass: 'h-10',
  },
  {
    name: 'Flipkart',
    logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Flipkart_logo_(2026).svg',
    logoClass: 'h-11 scale-125',
  },
  {
    name: 'Myntra',
    logo: myntraLogo,
    logoClass: 'h-10',
  },
  {
    name: 'Meesho',
    logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Meesho-final-logo_(1).jpg',
    logoClass: 'h-10',
  },
  {
    name: 'Ajio',
    wordmark: 'AJIO',
  },
  {
    name: 'Nykaa',
    logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Nykaa_New_Logo.svg',
    logoClass: 'h-10',
  },
  {
    name: 'Croma',
    logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Croma_Logo.png',
    logoClass: 'h-10',
  },
  {
    name: 'Tata CLiQ',
    wordmark: 'TATA CLiQ',
  },
  {
    name: 'Reliance Digital',
    logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/Reliance_Digital.svg',
    logoClass: 'h-10',
  },
];

function StoreCard({ store }) {
  return (
    <div className="shrink-0 w-44 rounded-2xl theme-bg-card backdrop-blur-sm theme-border border shadow-sm p-4 flex flex-col items-center justify-center gap-3 transition-all transform hover:-translate-y-1 hover:shadow-lg">
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
      viewport={{ once: false, amount: 0.2 }}
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
