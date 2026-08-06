import React, { useEffect, useState } from 'react';
import Logo from './Logo';

function detectBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'chrome';
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return 'edge';
  if (/brave/i.test(ua) || (navigator.brave && typeof navigator.brave.isBrave === 'function')) return 'brave';
  if (/opr|opera/i.test(ua)) return 'opera';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'safari';
  return 'chrome';
}

function BrowserIcon({ browser = 'chrome', size = 14 }) {
  switch (browser) {
    case 'edge':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.5 12A6.5 6.5 0 0 1 12 18.5 6.5 6.5 0 0 1 5.5 12 6.5 6.5 0 0 1 12 5.5c2.5 0 4.6 1.4 5.7 3.5" />
          <path d="M12 12h8.5" />
        </svg>
      );
    case 'firefox':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 0 10 10c0-4.4-3.6-8-8-8a8 8 0 0 0-8 8c0 4.4 3.6 8 8 8" />
        </svg>
      );
    case 'brave':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'safari':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case 'opera':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <ellipse cx="12" cy="12" rx="4" ry="7" />
        </svg>
      );
    case 'chrome':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="8" />
          <line x1="3.34" y1="17" x2="8.54" y2="14" />
          <line x1="20.66" y1="17" x2="15.46" y2="14" />
        </svg>
      );
  }
}

export default function Navbar({ onOpenDownload }) {
  const [browserKey, setBrowserKey] = useState('chrome');

  useEffect(() => {
    setBrowserKey(detectBrowser());
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b theme-border backdrop-blur-xl theme-bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <Logo size="md" />
        </a>

        {/* Install, it's free CTA button with dynamic browser symbol icon */}
        <button
          onClick={onOpenDownload}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#edf4ff] hover:bg-[#e0edff] text-[#1e293b] font-bold text-xs sm:text-sm border border-[#d0e2ff] shadow-sm hover:shadow transition-all duration-200 cursor-pointer transform-gpu hover:-translate-y-0.5"
          title={`Install Ocular for ${browserKey}`}
        >
          <span className="w-5 h-5 rounded-full bg-white text-[#2563eb] flex items-center justify-center shadow-xs">
            <BrowserIcon browser={browserKey} size={14} />
          </span>
          <span>Install, it's free</span>
        </button>
      </div>
    </header>
  );
}
