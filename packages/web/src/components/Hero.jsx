import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, ArrowRight, RefreshCw, Sparkles, Search } from 'lucide-react';

export default function Hero({ onAddProductFromUrl }) {
  const [inputUrl, setInputUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!inputUrl.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onAddProductFromUrl?.(inputUrl);
      setInputUrl('');
      setIsSubmitting(false);
    }, 600);
  };

  return (
    <section className="relative z-20 pt-4 pb-8 md:pt-6 md:pb-12 px-3 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-7xl mx-auto relative z-20">

        {/* Hero Card Container - Royal Blue Hero Palette matching requested style */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full rounded-[2.5rem] sm:rounded-[3rem] bg-gradient-to-b from-[#4338ca] via-[#3b82f6] to-[#2563eb] text-white px-6 py-12 sm:px-12 sm:py-16 md:py-20 shadow-2xl shadow-[#3b82f6]/30 text-center space-y-6 border border-white/20 overflow-hidden transform-gpu"
        >
          {/* Radial Light Flare overlay */}
          <div 
            className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent opacity-60" 
            aria-hidden="true" 
          />

          {/* Top Pill Tag Badge: Price History & Tracker */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-xs font-semibold tracking-wide uppercase shadow-xs"
          >
            <Sparkles size={13} className="text-yellow-300" />
            <span>Price History & Tracker</span>
          </motion.div>

          {/* Main Headline: Find Real Deals Skip the Fake Ones */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] drop-shadow-md"
          >
            Find <span className="text-[#34d399] drop-shadow-sm">Real Deals</span>
            <br />
            <span className="text-white">Skip the Fake Ones</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="text-xs sm:text-sm md:text-base text-blue-100/90 font-medium max-w-xl mx-auto leading-relaxed"
          >
            Track genuine price drops, compare across stores, and shop smarter every day
          </motion.p>

          {/* Product link search input bar */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="pt-2 max-w-xl mx-auto"
          >
            <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex flex-col sm:flex-row items-center gap-2 shadow-2xl border border-white/60">
              <label htmlFor="track-url" className="sr-only">
                Product link or search
              </label>
              <div className="flex items-center gap-2.5 w-full px-3 py-1.5 sm:py-0">
                <Search className="text-slate-400 shrink-0" size={18} aria-hidden="true" />
                <input
                  id="track-url"
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Paste a product link or Search a Product"
                  className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 text-xs sm:text-sm font-medium focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs sm:text-sm shrink-0 flex items-center justify-center gap-1.5 shadow-md transition-[transform,box-shadow,background-color] duration-200 transform-gpu hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin" size={15} aria-hidden="true" />
                    <span>Tracking...</span>
                  </>
                ) : (
                  <>
                    <span>Track Price</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </motion.form>

          {/* Bottom Banner Ribbon inside hero card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="pt-6 border-t border-white/15 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-xs text-blue-100 font-medium"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/20 backdrop-blur-sm border border-white/15 text-white font-semibold">
              <Sparkles size={12} className="text-yellow-300" />
              <span>Magic Trick for Online Shopping</span>
            </span>
            <span className="hidden sm:inline text-white/50">✦</span>
            <span>Instant price drop alerts across Amazon, Flipkart, Myntra & 20+ stores</span>
          </motion.div>

        </motion.div>

      </div>
    </section>
  );
}
