import React from 'react';
import Logo from './Logo';

export default function Navbar({ onOpenAuth }) {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b theme-border backdrop-blur-xl theme-bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Logo */}
        <a href="#" className="flex items-center">
          <Logo size="md" />
        </a>

        {/* Auth Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpenAuth && onOpenAuth('login')}
            className="px-4 py-2 rounded-xl theme-bg-surface hover:theme-bg-muted theme-text-main font-semibold text-xs theme-border border transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
          >
            Login
          </button>

          <button
            onClick={() => onOpenAuth && onOpenAuth('register')}
            className="px-5 py-2 rounded-xl theme-accent-bg theme-accent-bg-hover text-white font-bold text-xs shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
          >
            Register
          </button>
        </div>

      </div>
    </header>
  );
}
