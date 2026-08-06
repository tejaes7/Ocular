import React, { useEffect, useState } from 'react';
import Logo from './Logo';
import ChromeIcon from './ChromeIcon';

function detectBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'Chrome';
  const ua = navigator.userAgent;
  if (/edg/i.test(ua)) return 'Edge';
  if (/brave/i.test(ua) || (navigator.brave && typeof navigator.brave.isBrave === 'function')) return 'Brave';
  if (/opr|opera/i.test(ua)) return 'Opera';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  return 'Chrome';
}

export default function Navbar({ onOpenDownload }) {
  const [browserName, setBrowserName] = useState('Chrome');

  useEffect(() => {
    setBrowserName(detectBrowser());
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b theme-border backdrop-blur-xl theme-bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <Logo size="md" />
        </a>

        {/* Install button with detected browser */}
        <button
          onClick={onOpenDownload}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#edf4ff] hover:bg-[#e0edff] text-[#1e293b] font-bold text-xs sm:text-sm border border-[#d0e2ff] shadow-sm hover:shadow transition-all duration-200 cursor-pointer transform-gpu hover:-translate-y-0.5"
        >
          <span className="w-5 h-5 rounded-full bg-white text-[#2563eb] flex items-center justify-center shadow-xs">
            <ChromeIcon size={13} />
          </span>
          <span>Install on {browserName}, it's free</span>
        </button>
      </div>
    </header>
  );
}
