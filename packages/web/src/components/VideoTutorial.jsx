import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Film, X, Sparkles } from 'lucide-react';
import ChromeIcon from './ChromeIcon';

export default function VideoTutorial({ onOpenDownload }) {
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  return (
    <motion.section
      id="tutorial-video"
      initial={{ opacity: 0, y: 50, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="py-20 bg-transparent border-t theme-border relative z-20 transform-gpu"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="text-center max-w-3xl mx-auto space-y-3 mb-12"
        >
          <h2 className="text-3xl sm:text-5xl font-semibold theme-text-main tracking-tight">
            See How <span className="theme-accent-text">Ocular</span> Works
          </h2>
          <p className="text-sm sm:text-base theme-text-muted font-light">
            Watch our step-by-step tutorial on setting up the Ocular Extension.
          </p>
        </motion.div>

        {/* Video Player Card Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="max-w-4xl mx-auto relative group"
        >
          <div className="relative rounded-3xl glass-panel p-3 sm:p-5 theme-border border shadow-2xl overflow-hidden transition-all duration-300">
            
            {/* Video Thumbnail Screen */}
            <div className="relative h-64 sm:h-96 w-full rounded-2xl theme-bg-muted overflow-hidden flex items-center justify-center theme-border border">
              
              {/* Background Mock Video Image */}
              <img
                src="https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1200&q=80"
                alt="Tutorial Video Preview"
                className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-black/50" />

              {/* Play Overlay Button */}
              <button
                onClick={() => setIsVideoOpen(true)}
                className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full theme-accent-bg flex items-center justify-center text-white shadow-2xl group-hover:scale-110 transition-transform duration-200 cursor-pointer"
                aria-label="Play Tutorial Video"
              >
                <Play size={36} className="ml-1 fill-white stroke-none" />
              </button>

              {/* Top Controls Overlay */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-xs font-medium text-white flex items-center gap-1.5">
                  <Sparkles size={13} className="theme-accent-text" /> Ocular Extension Tutorial
                </span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg theme-accent-bg text-white text-xs font-mono font-medium">
                    1080p HD
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs font-mono">
                    0:45 min
                  </span>
                </div>
              </div>

              {/* Bottom Video Bar Info */}
              <div className="absolute bottom-4 left-4 right-4 z-10 bg-black/70 backdrop-blur-md p-3 sm:p-4 rounded-xl border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl theme-accent-bg text-white flex items-center justify-center font-semibold text-xs">
                    OC
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">How to Pin Extension & Track Products</h4>
                    <p className="text-[11px] text-slate-300 font-light">Step 1: Download package ➔ Step 2: Enable Developer Mode ➔ Step 3: Load Unpacked</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsVideoOpen(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg theme-accent-bg text-white font-semibold text-xs hover:opacity-90 transition-colors cursor-pointer"
                >
                  <Play size={13} className="fill-white" /> Watch Now
                </button>
              </div>

            </div>

          </div>

          <p className="text-center text-xs theme-text-subtle mt-3 font-mono">
            Tutorial Video Ready — Click Play to start playback.
          </p>
        </motion.div>

      </div>

      {/* Video Modal Player */}
      <AnimatePresence>
        {isVideoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl theme-bg-card rounded-2xl theme-border border p-4 shadow-2xl"
            >
              {/* Close Modal */}
              <button
                onClick={() => setIsVideoOpen(false)}
                className="absolute -top-3 -right-3 p-2 rounded-full theme-bg-surface theme-text-main theme-border border shadow-lg z-20 cursor-pointer"
              >
                <X size={18} />
              </button>

              {/* Video Player Box */}
              <div className="relative aspect-video rounded-xl theme-bg-muted overflow-hidden theme-border border flex flex-col justify-between p-6">
                
                <div className="flex items-center justify-between border-b theme-border pb-3">
                  <div className="flex items-center gap-2 text-xs font-semibold theme-accent-text">
                    <Film size={16} /> Ocular Setup Tutorial
                  </div>
                  <span className="text-xs theme-text-subtle font-mono">Simulated Playback</span>
                </div>

                <div className="my-auto text-center space-y-4 max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full theme-accent-bg-soft theme-accent-text flex items-center justify-center mx-auto">
                    <ChromeIcon size={32} />
                  </div>
                  <h3 className="text-lg font-semibold theme-text-main">Ocular Tutorial Walkthrough</h3>
                  <p className="text-xs theme-text-muted font-light leading-relaxed">
                    This video player is ready for your extension walkthrough video package.
                  </p>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setIsVideoOpen(false);
                        onOpenDownload();
                      }}
                      className="px-5 py-2.5 rounded-xl theme-accent-bg text-white font-semibold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <ChromeIcon size={16} /> Download Extension Package
                    </button>
                  </div>
                </div>

                <div className="border-t theme-border pt-3 space-y-2">
                  <div className="h-1.5 w-full theme-bg-surface rounded-full overflow-hidden">
                    <div className="h-full w-2/3 theme-accent-bg rounded-full" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] theme-text-subtle font-mono">
                    <span>00:30 / 00:45</span>
                    <span className="theme-accent-text">Volume: 100%</span>
                  </div>
                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
