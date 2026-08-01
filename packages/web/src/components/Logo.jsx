import React from 'react';
import markUrl from '../assets/ocular-mark.png';

export default function Logo({ size = 'md', textColor = '', className = '' }) {
  const sizeMap = {
    sm: { box: 'w-7 h-7', text: 'text-lg' },
    md: { box: 'w-9 h-9', text: 'text-xl' },
    lg: { box: 'w-11 h-11', text: 'text-2xl' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`flex items-center gap-2.5 tracking-tight group cursor-pointer ${className}`}>
      {/* The mark from the brand logo. No badge behind it — the mark already has
          its own silhouette, and a filled tile would clip its open counter. */}
      <img
        src={markUrl}
        alt=""
        aria-hidden="true"
        className={`${currentSize.box} object-contain shrink-0 transition-transform duration-200 group-hover:scale-105`}
      />

      {/* Wordmark. The site font is the geometric sans the logo lockup uses, so
          this matches the artwork instead of duplicating it as an image. */}
      <span className={`${currentSize.text} font-normal ${textColor || 'theme-text-main'}`}>
        Ocular
      </span>
    </div>
  );
}
