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
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-[3rem] bg-gradient-to-b from-[#92c6f5] via-[#7bb9f2] to-[#64acef] text-[#14283f] p-12 sm:p-20 md:p-24 shadow-2xl shadow-[#7bb9f2]/40 text-center space-y-6 border border-white/40 transform-gpu"
        >
          {/* Main Ocular Title (Thinner Font Weight) */}
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

          {/* Interactive Tracker Input Box */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="pt-2 max-w-xl mx-auto"
          >
            <form onSubmit={handleSubmit} className="relative group">
              <div className="relative bg-white/95 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex flex-col sm:flex-row items-center gap-2 shadow-2xl border border-white/40">
                <div className="flex items-center gap-2.5 w-full px-3 py-1.5 sm:py-0 text-slate-800">
                  <Link2 className="text-[#7bb9f2] shrink-0" size={16} />
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
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#7bb9f2] hover:bg-[#5da8ee] text-[#14283f] font-semibold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-md transition-[transform,box-shadow,background-color] duration-200 cursor-pointer transform-gpu hover:-translate-y-0.5 hover:shadow-lg"
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
                className="mt-4 p-2.5 rounded-xl bg-white/60 backdrop-blur-md text-[#14283f] text-[11px] font-medium flex items-center justify-center gap-2 border border-[#14283f]/20"
              >
                <Check size={14} className="text-[#14283f] shrink-0" />
                <span>Product link added to Ocular price tracker</span>
              </motion.div>
            )}
          </motion.div>

          {/* Download Extension Button */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
            className="pt-3 flex justify-center"
          >
            <button
              onClick={onOpenDownload}
              className="py-3 px-7 rounded-2xl bg-white text-[#7bb9f2] hover:bg-[#eef6fd] font-semibold text-xs flex items-center justify-center gap-2.5 shadow-xl cursor-pointer transform-gpu hover:-translate-y-1 hover:shadow-2xl transition-[transform,box-shadow,background-color] duration-200"
            >
              <ChromeIcon size={18} className="stroke-[2] text-[#7bb9f2]" />
              <span>Download Extension</span>
            </button>
          </motion.div>

        </motion.div>

      </div>
    </section>
  );
}
