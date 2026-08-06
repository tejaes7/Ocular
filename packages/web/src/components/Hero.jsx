import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, ArrowRight, RefreshCw } from 'lucide-react';

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

        {/* Curved Blue Card Container */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-[3rem] bg-gradient-to-b from-[#92c6f5] via-[#7bb9f2] to-[#64acef] text-[#14283f] px-8 py-14 sm:px-16 sm:py-20 md:py-24 shadow-2xl shadow-[#7bb9f2]/40 text-center space-y-5 border border-white/40 transform-gpu"
        >
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-[#14283f] leading-none drop-shadow-sm"
          >
            Ocular
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="text-xs sm:text-sm text-[#14283f]/80 font-light max-w-md mx-auto leading-relaxed"
          >
            Track prices across online stores and get notified when prices drop.
          </motion.p>

          {/* Product link tracker */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="pt-3 max-w-xl mx-auto"
          >
            <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex flex-col sm:flex-row items-center gap-2 shadow-xl border border-white/50">
              <label htmlFor="track-url" className="sr-only">
                Product link
              </label>
              <div className="flex items-center gap-2.5 w-full px-3 py-1.5 sm:py-0">
                <Link2 className="text-[#7bb9f2] shrink-0" size={16} aria-hidden="true" />
                <input
                  id="track-url"
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Paste product link to track price..."
                  className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 text-xs font-normal focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl theme-accent-bg theme-accent-bg-hover font-semibold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-md transition-[transform,box-shadow,background-color] duration-200 transform-gpu hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} aria-hidden="true" />
                    <span>Tracking...</span>
                  </>
                ) : (
                  <>
                    <span>Track Price</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </motion.form>

        </motion.div>

      </div>
    </section>
  );
}
