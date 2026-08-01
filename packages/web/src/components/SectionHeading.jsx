import React from 'react';
import { motion } from 'framer-motion';
import { fadeInOut } from '../utils/motion';

export default function SectionHeading({ eyebrow, title, description, className = '' }) {
  return (
    <motion.div {...fadeInOut} className={`relative z-10 text-center max-w-2xl mx-auto space-y-3 break-words ${className}`}>
      <span className="inline-block px-3.5 py-1 rounded-full border theme-border text-xs font-semibold theme-text-muted break-words theme-bg-surface shadow-sm">
        {eyebrow}
      </span>
      <div className="w-px h-5 mx-auto opacity-40" style={{ backgroundColor: 'var(--border-main)' }} />
      <h2 className="font-display text-2xl sm:text-4xl font-bold theme-text-main tracking-tight break-words">
        {title}
      </h2>
      {description && (
        <p className="text-sm sm:text-base theme-text-muted break-words leading-relaxed max-w-xl mx-auto">
          {description}
        </p>
      )}
    </motion.div>
  );
}
