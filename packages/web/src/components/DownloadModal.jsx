import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import ChromeIcon from './ChromeIcon';

export default function DownloadModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const handleDownloadPackage = () => {
    const content = `Ocular Chrome Extension Setup Guide v1.0.0

Thank you for downloading Ocular!

Follow these 4 simple steps to install the extension in Chrome / Brave / Edge:

1. Unzip the downloaded 'ocular-extension-v1.0.zip' folder.
2. Open Chrome and navigate to chrome://extensions/ in your address bar.
3. Enable 'Developer mode' in the top-right corner.
4. Click 'Load unpacked' and select the unzipped folder.

Ocular will automatically start tracking prices across supported e-commerce stores!`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ocular-extension-setup.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg theme-bg-card rounded-2xl theme-border border p-6 md:p-8 shadow-2xl overflow-hidden"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 theme-text-muted hover:theme-text-main p-2 rounded-xl theme-bg-surface theme-border border transition-colors"
          >
            <X size={20} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl theme-accent-bg-soft theme-border border flex items-center justify-center theme-accent-text">
              <ChromeIcon size={28} />
            </div>
            <div>
              <h3 className="text-xl font-bold theme-text-main flex items-center gap-2">
                Download Ocular Extension
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full theme-accent-bg-soft theme-accent-text border theme-border">v1.0.0</span>
              </h3>
              <p className="text-sm theme-text-muted">Fast & 100% secure automatic price tracker</p>
            </div>
          </div>

          {/* Alert Notice */}
          <div className="theme-bg-muted theme-border border rounded-xl p-3.5 mb-6 flex items-start gap-3 text-xs theme-text-muted">
            <AlertCircle size={18} className="theme-accent-text shrink-0 mt-0.5" />
            <p>
              <strong className="theme-text-main">Note:</strong> Package installer setup ready. Click below to download setup instructions.
            </p>
          </div>

          {/* Download Action */}
          <button
            onClick={handleDownloadPackage}
            className="w-full py-3.5 px-6 rounded-xl theme-accent-bg theme-accent-bg-hover text-white font-bold text-base flex items-center justify-center gap-3 shadow-lg transition-all duration-200"
          >
            <Download size={20} />
            Download Ocular Package (.zip / setup)
            <ArrowRight size={18} />
          </button>

          {/* Installation Steps */}
          <div className="mt-6 pt-5 border-t theme-border">
            <h4 className="text-sm font-semibold theme-text-main mb-3 flex items-center justify-between">
              <span>Quick Installation Steps</span>
              <span className="text-xs theme-accent-text flex items-center gap-1">
                <ShieldCheck size={14} /> Verified Secure
              </span>
            </h4>

            <ul className="space-y-2 text-xs theme-text-muted">
              <li className="flex items-center gap-2.5 theme-bg-surface p-2.5 rounded-lg theme-border border">
                <span className="w-5 h-5 rounded-full theme-bg-muted theme-accent-text font-bold text-[10px] flex items-center justify-center">1</span>
                <span>Unzip the downloaded <strong>ocular-extension-v1.0.zip</strong></span>
              </li>
              <li className="flex items-center gap-2.5 theme-bg-surface p-2.5 rounded-lg theme-border border">
                <span className="w-5 h-5 rounded-full theme-bg-muted theme-accent-text font-bold text-[10px] flex items-center justify-center">2</span>
                <span>Open <code>chrome://extensions</code> in Chrome / Brave / Edge</span>
              </li>
              <li className="flex items-center gap-2.5 theme-bg-surface p-2.5 rounded-lg theme-border border">
                <span className="w-5 h-5 rounded-full theme-bg-muted theme-accent-text font-bold text-[10px] flex items-center justify-center">3</span>
                <span>Toggle <strong>Developer mode</strong> (top-right corner)</span>
              </li>
              <li className="flex items-center gap-2.5 theme-bg-surface p-2.5 rounded-lg theme-border border">
                <span className="w-5 h-5 rounded-full theme-bg-muted theme-accent-text font-bold text-[10px] flex items-center justify-center">4</span>
                <span>Click <strong>Load unpacked</strong> & select the unzipped folder!</span>
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
