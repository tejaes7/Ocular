import React, { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import edgeLogoUrl from '../assets/edge-logo.png';
import chromeLogoUrl from '../assets/chrome-logo.png';
import braveLogoUrl from '../assets/brave-logo.png';
import { NUDGE_INSTALL_EVENT } from '../lib/extension';

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

function AuthenticBrowserIcon({ browser = 'chrome', size = 22 }) {
  switch (browser) {
    case 'edge':
      return (
        <img
          src={edgeLogoUrl}
          alt="Microsoft Edge Logo"
          width={size}
          height={size}
          className="w-full h-full object-contain"
        />
      );
    case 'brave':
      return (
        <img
          src={braveLogoUrl}
          alt="Brave Browser Logo"
          width={size}
          height={size}
          className="w-full h-full object-contain"
        />
      );
    case 'firefox':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#E66000"/>
          <path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 13a5 5 0 1 1 5-5 5 5 0 0 1-5 5z" fill="#FF9400"/>
          <circle cx="12" cy="12" r="3.5" fill="#0060DF"/>
        </svg>
      );
    case 'safari':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#007AFF"/>
          <circle cx="12" cy="12" r="8.5" fill="#FFFFFF"/>
          <polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5" fill="#FF3B30"/>
          <polygon points="15.5 8.5 13.5 13.5 10.5 10.5" fill="#007AFF"/>
        </svg>
      );
    case 'chrome':
    default:
      return (
        <img
          src={chromeLogoUrl}
          alt="Google Chrome Logo"
          width={size}
          height={size}
          className="w-full h-full object-contain"
        />
      );
  }
}

export default function Navbar({ onOpenDownload }) {
  const [browserKey, setBrowserKey] = useState('chrome');

  useEffect(() => {
    setBrowserKey(detectBrowser());
  }, []);

  // Pasting a product link with no extension installed asks this button to
  // announce itself.
  //
  // Driven straight through a ref rather than React state. A CSS animation only
  // replays if the class is removed, layout is recomputed, and it is added back;
  // reading offsetWidth forces that reflow synchronously. Doing the same via
  // state needed a frame between the two renders, which meant leaning on
  // requestAnimationFrame — and anywhere that does not fire (a background tab,
  // a headless viewport) the class was simply never re-applied.
  const installRef = useRef(null);
  useEffect(() => {
    let timer = null;

    const onNudge = () => {
      const el = installRef.current;
      if (!el) return;

      el.classList.remove('ocular-nudge');
      void el.offsetWidth; // reflow, so the animation restarts on a repeat paste
      el.classList.add('ocular-nudge');

      // The sweep is the visual half; this is the half that actually takes you
      // there. Focus is what makes it work for someone not using a mouse — the
      // button is announced and is the next thing Enter will press, rather than
      // being a colour change they cannot see. `preventScroll` keeps focus from
      // yanking the page while the smooth scroll is still running.
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el.focus({ preventScroll: true });

      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('ocular-nudge'), 1000);
    };

    window.addEventListener(NUDGE_INSTALL_EVENT, onNudge);
    return () => {
      window.removeEventListener(NUDGE_INSTALL_EVENT, onNudge);
      clearTimeout(timer);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b theme-border backdrop-blur-xl theme-bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <Logo size="md" />
        </a>

        {/* Install, it's free CTA button without white circular background */}
        <button
          onClick={onOpenDownload}
          ref={installRef}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#f0f5ff] hover:bg-[#e4edff] text-[#1e295d] font-bold text-xs sm:text-sm border border-[#d5e3ff] shadow-xs hover:shadow transition-all duration-200 cursor-pointer transform-gpu hover:-translate-y-0.5"
          title={`Install Ocular for ${browserKey}`}
        >
          <span className="min-w-6 h-6 flex items-center justify-center shrink-0">
            <AuthenticBrowserIcon browser={browserKey} size={22} />
          </span>
          <span>Install, it's free</span>
        </button>
      </div>
    </header>
  );
}
