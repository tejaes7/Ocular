import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, ArrowRight, Check, RefreshCw } from 'lucide-react';
import ChromeIcon from './ChromeIcon';
import confetti from 'canvas-confetti';

export default function Hero({ onAddProductFromUrl, onOpenDownload }) {
  const [inputUrl, setInputUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    setIsSubmitting(true);

    setTimeout(() => {
      onAddProductFromUrl(inputUrl);
      setIsSubmitting(false);
      setInputUrl('');
      setShowSuccessToast(true);

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch (err) {}

      setTimeout(() => {
        setShowSuccessToast(false);
      }, 4000);
    }, 600);
  };

  return (
    <section className="relative z-20 pt-4 pb-8 md:pt-6 md:pb-12 px-3 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-7xl mx-auto relative z-20">
        
        {/* Curved Blue Card Container */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: false, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-[3rem] bg-gradient-to-b from-sky-600 via-sky-600 to-sky-700 text-white p-12 sm:p-20 md:p-24 shadow-2xl shadow-sky-600/25 text-center space-y-6 border border-sky-400/30 transform-gpu"
        >
          {/* Main Ocular Title (Thinner Font Weight) */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-white leading-none drop-shadow-sm"
          >
            Ocular
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="text-xs sm:text-sm text-sky-100 font-light max-w-md mx-auto leading-relaxed"
          >
            Track prices across online stores and get notified when prices drop.
          </motion.p>

          {/* Interactive Tracker Input Box */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="pt-2 max-w-xl mx-auto"
          >
            <form onSubmit={handleSubmit} className="relative group">
              <div className="relative bg-white/95 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex flex-col sm:flex-row items-center gap-2 shadow-2xl border border-white/40">
                <div className="flex items-center gap-2.5 w-full px-3 py-1.5 sm:py-0 text-slate-800">
                  <Link2 className="text-sky-600 shrink-0" size={16} />
                  <input
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
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="animate-spin" size={14} />
                      <span>Tracking...</span>
                    </>
                  ) : (
                    <>
                      <span>Track Price</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Success Toast */}
            {showSuccessToast && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="mt-4 p-2.5 rounded-xl bg-white/20 backdrop-blur-md text-white text-[11px] font-medium flex items-center justify-center gap-2 border border-white/30"
              >
                <Check size={14} className="text-white shrink-0" />
                <span>Product link added to Ocular price tracker</span>
              </motion.div>
            )}
          </motion.div>

          {/* Download Extension Button */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
            className="pt-3 flex justify-center"
          >
            <button
              onClick={onOpenDownload}
              className="py-3 px-7 rounded-2xl bg-white text-sky-700 hover:bg-sky-50 font-semibold text-xs flex items-center justify-center gap-2.5 shadow-xl cursor-pointer transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-200"
            >
              <ChromeIcon size={18} className="stroke-[2] text-sky-700" />
              <span>Download Extension</span>
            </button>
          </motion.div>

        </motion.div>

      </div>
    </section>
  );
}
