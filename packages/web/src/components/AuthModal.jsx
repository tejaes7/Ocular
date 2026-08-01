import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ShieldCheck } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // 'login' or 'register'
  const { user, profile, pending: isAuthenticating, error, signIn, signOut } = useAuth();

  // Prefer whatever the backend knows about the account, fall back to the
  // Google profile so the panel still renders if /me is unreachable.
  const userProfile = user
    ? {
        name: profile?.name || user.displayName || 'Ocular user',
        email: profile?.email || user.email || '',
        avatar: profile?.avatar || user.photoURL || '',
      }
    : null;

  const handleGoogleSignIn = async () => {
    try {
      await signIn();
    } catch {
      // Surfaced through `error` from the context.
    }
  };

  const handleSignOut = () => signOut();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md theme-bg-card rounded-3xl theme-border border p-6 sm:p-8 shadow-2xl overflow-hidden"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full theme-bg-surface theme-text-muted hover:theme-text-main theme-border border transition-colors"
          >
            <X size={18} />
          </button>

          {/* Logo & Header */}
          <div className="text-center space-y-2 mb-6">
            <div className="flex justify-center mb-3">
              <Logo size="md" />
            </div>
            <h3 className="text-xl font-extrabold theme-text-main">
              {userProfile ? 'Signed In to Ocular' : mode === 'login' ? 'Sign in to Ocular' : 'Create your Ocular Account'}
            </h3>
            <p className="text-xs theme-text-muted">
              {userProfile
                ? 'Your account is synchronized with Ocular price tracker'
                : 'Sign in with Google to sync your tracked items across devices'}
            </p>
          </div>

          {/* Login / Register Toggle Tabs */}
          {!userProfile && (
            <div className="flex p-1 rounded-xl theme-bg-surface theme-border border mb-6">
              <button
                onClick={() => setMode('login')}
                className={`w-1/2 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === 'login'
                    ? 'theme-accent-bg text-[#14283f] shadow-md'
                    : 'theme-text-muted hover:theme-text-main'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setMode('register')}
                className={`w-1/2 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === 'register'
                    ? 'theme-accent-bg text-[#14283f] shadow-md'
                    : 'theme-text-muted hover:theme-text-main'
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* Authenticated Profile View */}
          {userProfile ? (
            <div className="space-y-5 text-center py-2">
              <div className="p-4 rounded-2xl theme-bg-surface theme-border border flex items-center gap-4">
                {userProfile.avatar ? (
                  <img
                    src={userProfile.avatar}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover border-2 theme-border shadow-md"
                  />
                ) : (
                  // Google accounts without a photo would otherwise render a
                  // broken <img> with an empty src.
                  <div className="w-12 h-12 rounded-full theme-accent-bg flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                    {(userProfile.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left">
                  <h4 className="text-sm font-bold theme-text-main">{userProfile.name}</h4>
                  <p className="text-xs theme-text-muted font-mono">{userProfile.email}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold theme-accent-text mt-1">
                    <CheckCircle2 size={12} /> Google Verified Account
                  </span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl theme-accent-bg text-[#14283f] font-bold text-xs shadow-md"
                >
                  Continue to Ocular
                </button>
                <button
                  onClick={handleSignOut}
                  className="py-3 px-4 rounded-xl theme-bg-surface theme-border border theme-text-muted hover:theme-text-main font-semibold text-xs"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            /* Sign In / Register with Google Form */
            <div className="space-y-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={isAuthenticating}
                className="w-full py-3.5 px-4 rounded-2xl theme-bg-surface hover:theme-bg-muted theme-border border theme-text-main font-bold text-xs flex items-center justify-center gap-3 shadow-sm transition-all transform hover:-translate-y-0.5"
              >
                {isAuthenticating ? (
                  <span className="flex items-center gap-2 theme-text-muted">
                    <svg className="animate-spin h-4 w-4 text-[#7bb9f2]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Authenticating with Google...</span>
                  </span>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>{mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}</span>
                  </>
                )}
              </button>

              {error && (
                <p
                  role="alert"
                  className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-center"
                >
                  {error.code === 'NETWORK_ERROR'
                    ? "Couldn't reach the Ocular backend. Check your connection and try again."
                    : error.message}
                </p>
              )}

              <div className="flex items-center gap-2 text-[10px] theme-text-subtle justify-center pt-2">
                <ShieldCheck size={13} className="theme-accent-text" />
                <span>Secure OAuth 2.0 Google Authentication</span>
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
