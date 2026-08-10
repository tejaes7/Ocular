import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, ArrowRight, RefreshCw } from 'lucide-react';
import HeroDoodles from './HeroDoodles';
import { detectExtension, trackViaExtension, nudgeInstall } from '../lib/extension';

export default function Hero({ onAddProductFromUrl }) {
  const [inputUrl, setInputUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Hand the link to the extension, or point at the install button.
   *
   * This used to be theatre: it ignored the URL entirely and popped a toast
   * claiming the product had been added. Tracking needs extraction from the
   * store page itself, which only the extension can do — so the honest paths are
   * "hand it over" or "you need the extension first".
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    const url = inputUrl.trim();
    if (!url || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { installed } = await detectExtension();

      if (!installed) {
        // Nothing to hand the link to, so point at the thing that fixes that.
        //
        // This used to open the download modal as well. One response is better
        // than two: the modal covered the very button it was telling you about,
        // and dismissing it left you back where you started. The nudge moves
        // focus to the install button instead, so the answer is on screen and
        // already under the cursor — and keyboard users are taken there rather
        // than having a dialog thrown in front of them.
        nudgeInstall();
        return;
      }

      const result = await trackViaExtension(url);
      if (result?.ok) {
        setInputUrl('');
        onAddProductFromUrl?.(url, result);
      } else {
        onAddProductFromUrl?.(url, result || { ok: false });
      }
    } catch {
      // The relay never answered — same outcome as not installed, so the same
      // response.
      nudgeInstall();
    } finally {
      setIsSubmitting(false);
    }
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
          className="relative overflow-hidden w-full rounded-[3rem] bg-gradient-to-b from-[#92c6f5] via-[#7bb9f2] to-[#64acef] text-[#14283f] px-8 py-14 sm:px-16 sm:py-20 md:py-24 shadow-2xl shadow-[#7bb9f2]/40 text-center space-y-5 border border-white/40 transform-gpu"
        >
          <HeroDoodles />

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
            autoComplete="off"
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="pt-3 max-w-xl mx-auto"
          >
            <div className="bg-white/95 backdrop-blur-md rounded-2xl p-1.5 sm:p-2 flex flex-col sm:flex-row items-center gap-2 shadow-xl border border-white/50">
              {/*
                The label wraps the field rather than sitting beside it, so the
                whole padded box is one click target — and one cursor region.

                autoComplete="off" and the missing `name` are what stop the
                browser offering previously submitted links back on focus. That
                history is the browser's own, keyed on the control's name; a
                field without a name has nothing to look up. Nothing in this app
                ever stored those URLs, which is why there was no state to clear.
                The value is read from React state rather than form
                serialisation, so dropping the name costs nothing.
              */}
              <label
                htmlFor="track-url"
                id="track-url-field"
                className="flex items-center gap-2.5 w-full px-3 py-1.5 sm:py-0"
              >
                <span className="sr-only">Product link</span>
                <Link2 className="text-[#7bb9f2] shrink-0" size={16} aria-hidden="true" />
                <input
                  id="track-url"
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="Paste product link to track price..."
                  className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 text-xs font-normal focus:outline-none"
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>

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
