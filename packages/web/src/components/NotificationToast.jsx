import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Sparkles, X } from 'lucide-react';

export default function NotificationToast({ toastMessage, onClose }) {
  if (!toastMessage) return null;

  return (
    <AnimatePresence>
      <div className="fixed bottom-6 right-6 z-50 max-w-md w-full px-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="glass-panel p-4 rounded-2xl theme-border border shadow-2xl flex items-start gap-3 relative theme-bg-card"
        >
          <div className="w-9 h-9 rounded-xl theme-accent-bg-soft theme-accent-text border theme-border flex items-center justify-center shrink-0 mt-0.5">
            <Bell size={18} className="animate-bounce" />
          </div>

          <div className="flex-1 pr-6">
            <span className="text-[10px] font-bold theme-accent-text uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={12} /> Ocular Alert
            </span>
            <p className="text-xs font-semibold theme-text-main mt-0.5 leading-snug">
              {toastMessage}
            </p>
          </div>

          <button
            onClick={onClose}
            className="absolute top-3 right-3 theme-text-muted hover:theme-text-main p-1 rounded-lg theme-bg-surface theme-border border"
          >
            <X size={14} />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
