import React from 'react';

/**
 * Custom High-Quality Chrome SVG Icon
 */
export default function ChromeIcon({ size = 20, className = '' }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3.34" y1="17" x2="8.54" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="20.66" y1="17" x2="15.46" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
