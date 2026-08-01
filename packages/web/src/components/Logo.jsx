import React from 'react';
import { Eye } from 'lucide-react';

export default function Logo({ size = 'md', textColor = '', className = '' }) {
  const sizeMap = {
    sm: { box: 'w-7 h-7', icon: 16, text: 'text-lg' },
    md: { box: 'w-9 h-9', icon: 20, text: 'text-xl' },
    lg: { box: 'w-11 h-11', icon: 24, text: 'text-2xl' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`flex items-center gap-2.5 font-extrabold tracking-tight group cursor-pointer ${className}`}>
      {/* Icon Badge */}
      <div className={`relative ${currentSize.box} rounded-xl bg-sky-500 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-200`}>
        <Eye className="text-white relative z-10 stroke-[2.5]" size={currentSize.icon} />
      </div>

      {/* Brand Name (Just Ocular) */}
      <span className={`${currentSize.text} font-bold ${textColor || 'theme-text-main'}`}>
        Ocular
      </span>
    </div>
  );
}
