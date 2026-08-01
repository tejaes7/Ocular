import React from 'react';
import { motion } from 'framer-motion';
import { Download, ShieldCheck, Star, Sparkles, TrendingDown, ArrowRight, Zap } from 'lucide-react';
import ChromeIcon from './ChromeIcon';

export default function ExtensionBanner({ onOpenDownload }) {
  return (
    <section className="py-20 bg-slate-950 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Banner Box Container */}
        <div className="relative rounded-3xl glass-panel border border-slate-700/60 p-8 sm:p-14 overflow-hidden shadow-2xl shadow-emerald-950/40">
          
          {/* Background Glow Elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-600/15 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Text Info */}
            <div className="lg:col-span-8 space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles size={14} /> 100% Free Chrome Extension
              </div>

              <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                Start Saving Money on Amazon & Flipkart <span className="text-gradient-emerald">Today</span>.
              </h2>

              <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
                Join over 50,000+ smart shoppers who have saved more than ₹2.5 Crores automatically with instant all-time lowest price drop notifications.
              </p>

              {/* Metrics Badge Row */}
              <div className="grid grid-cols-3 gap-4 max-w-lg pt-2 text-center sm:text-left">
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Total Saved</span>
                  <span className="text-lg font-extrabold text-emerald-400">₹2.5 Cr+</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Active Users</span>
                  <span className="text-lg font-extrabold text-white">50,000+</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-xs text-slate-400 block">Rating</span>
                  <span className="text-lg font-extrabold text-amber-300 flex items-center justify-center sm:justify-start gap-1">
                    4.9 <Star size={14} fill="currentColor" />
                  </span>
                </div>
              </div>
            </div>

            {/* Right Huge CTA Action */}
            <div className="lg:col-span-4 flex flex-col items-center lg:items-end justify-center">
              <button
                onClick={onOpenDownload}
                className="w-full sm:w-auto py-5 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-emerald-500/40 transform hover:-translate-y-1 transition-all duration-300 group"
              >
                <ChromeIcon size={26} className="stroke-[2.5]" />
                <div className="text-left">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-900/80">Get PriceDrop Free</div>
                  <div className="text-base font-extrabold leading-tight">Download Extension</div>
                </div>
                <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform ml-1" />
              </button>

              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5 font-medium">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span>Supports Chrome, Brave & Edge Browsers</span>
              </p>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
