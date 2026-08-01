import React from 'react';
import Logo from './Logo';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Navbar({ onOpenAuth }) {
  const { user, profile, ready, signOut } = useAuth();
  const displayName = profile?.name || user?.displayName || user?.email || '';

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b theme-border backdrop-blur-xl theme-bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Logo */}
        <a href="#" className="flex items-center">
          <Logo size="md" />
        </a>

        {/* Auth Buttons. Rendered only once Firebase has reported the restored
            session, so a signed-in visitor never sees "Login" flash on reload. */}
        <div className="flex items-center gap-3">
          {!ready ? null : user ? (
            <>
              <button
                onClick={() => onOpenAuth && onOpenAuth('login')}
                className="px-4 py-2 rounded-xl theme-bg-surface hover:theme-bg-muted theme-text-main font-semibold text-xs theme-border border transition-colors duration-200 cursor-pointer max-w-[12rem] truncate"
                title={displayName}
              >
                {displayName}
              </button>

              <button
                onClick={signOut}
                className="px-5 py-2 rounded-xl theme-accent-bg theme-accent-bg-hover font-bold text-xs shadow-md transition-[transform,box-shadow,background-color] duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onOpenAuth && onOpenAuth('login')}
                className="px-4 py-2 rounded-xl theme-bg-surface hover:theme-bg-muted theme-text-main font-semibold text-xs theme-border border transition-[transform,box-shadow,background-color] duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
              >
                Login
              </button>

              <button
                onClick={() => onOpenAuth && onOpenAuth('register')}
                className="px-5 py-2 rounded-xl theme-accent-bg theme-accent-bg-hover font-bold text-xs shadow-md transition-[transform,box-shadow,background-color] duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
              >
                Register
              </button>
            </>
          )}
        </div>

      </div>
    </header>
  );
}
