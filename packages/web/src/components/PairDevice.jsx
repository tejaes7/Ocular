import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Mail, ShieldAlert } from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../auth/AuthContext.jsx';
import { linkDevice } from '../api';

/**
 * The pairing page — reached as `/?pair=<device-uuid>`, opened by the extension.
 *
 * Why the extension sends the user here instead of signing them in itself: this
 * is the only place in the product where both identities are present at once,
 * and it is the only call that joins them. The website already has working
 * Firebase auth; the extension has none, and giving it some would mean an OAuth
 * client, the `identity` permission, and working around Firebase's JS SDK not
 * functioning inside an MV3 service worker. Handing the device id to a page
 * that is already signed in avoids all of it.
 *
 * A query parameter rather than a route because the site has no router, so
 * `/pair` would 404 on static hosting unless the host were configured to rewrite
 * it. This works as shipped.
 *
 * What this page must never do is link silently. The person arrives having asked
 * for email alerts, but joining their watchlist to their account is the one
 * action in Ocular that makes their tracking non-anonymous, so it takes a
 * deliberate press and says what it costs first.
 */

/** Same shape the worker enforces; a malformed id should fail here, not there. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pairDeviceIdFromLocation(search = window.location.search) {
  const value = new URLSearchParams(search).get('pair');
  return value && UUID_RE.test(value) ? value.toLowerCase() : null;
}

export default function PairDevice({ deviceId }) {
  const { user, profile, ready, pending, signIn } = useAuth();
  const [state, setState] = useState('idle'); // idle | linking | done | error
  const [error, setError] = useState(null);

  const email = profile?.email || user?.email || '';

  const handleSignIn = useCallback(async () => {
    try {
      await signIn();
    } catch {
      // Surfaced by the auth context; closing the popup is not an error.
    }
  }, [signIn]);

  const handleLink = useCallback(async () => {
    setState('linking');
    setError(null);
    try {
      const token = await user.getIdToken();
      await linkDevice(token, deviceId);
      setState('done');
    } catch (err) {
      setError(err);
      setState('error');
    }
  }, [user, deviceId]);

  // Clear the id out of the address bar once it has been used. It is not a
  // secret, but it should not sit in history or get pasted into a chat — anyone
  // holding it could attach *their* account to *this* browser's watchlist.
  useEffect(() => {
    if (state !== 'done') return;
    window.history.replaceState({}, '', window.location.pathname);
  }, [state]);

  return (
    <div className="min-h-screen theme-bg-main theme-text-main flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md theme-bg-card rounded-3xl theme-border border p-6 sm:p-8 shadow-2xl"
      >
        <div className="mb-6">
          <Logo />
        </div>

        {state === 'done' ? (
          <>
            <CheckCircle2 className="text-emerald-500 mb-4" size={28} />
            <h1 className="text-xl font-semibold mb-2">Email alerts are on</h1>
            <p className="theme-text-muted text-sm leading-relaxed">
              We&rsquo;ll email {email ? <strong>{email}</strong> : 'you'} when a price drops while
              this browser is closed. You can turn it off from the extension&rsquo;s options at any
              time, which unlinks this browser again.
            </p>
            <p className="theme-text-muted text-sm mt-4">You can close this tab.</p>
          </>
        ) : (
          <>
            <Mail className="mb-4" size={26} />
            <h1 className="text-xl font-semibold mb-2">Turn on email price alerts</h1>
            <p className="theme-text-muted text-sm leading-relaxed mb-5">
              Ocular keeps checking prices while your browser is closed. Email is the only way it
              can tell you about a drop before you next open Chrome.
            </p>

            {/* Stated before the button, not after. Someone deciding whether to
                do this needs the cost in the same breath as the benefit. */}
            <div className="theme-bg-surface theme-border border rounded-2xl p-4 mb-6">
              <div className="flex gap-3">
                <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">
                  <p className="font-medium mb-1">What this changes</p>
                  <p className="theme-text-muted">
                    Turning this on links this browser&rsquo;s watchlist to your account, so the
                    things you track stop being anonymous to us. It is reversible — turning alerts
                    off unlinks it again. Everything else about Ocular is unchanged.
                  </p>
                </div>
              </div>
            </div>

            {!ready ? (
              <p className="theme-text-muted text-sm">Checking your session&hellip;</p>
            ) : !user ? (
              <button
                onClick={handleSignIn}
                disabled={pending}
                className="w-full rounded-2xl px-4 py-3 font-medium theme-border border hover:theme-bg-surface transition-colors disabled:opacity-50"
              >
                {pending ? 'Signing in…' : 'Sign in with Google to continue'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleLink}
                  disabled={state === 'linking'}
                  className="w-full rounded-2xl px-4 py-3 font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {state === 'linking' ? 'Linking…' : `Send alerts to ${email || 'my account'}`}
                </button>
                <p className="theme-text-muted text-xs mt-3 text-center">
                  Signed in as {email || 'your account'}
                </p>
              </>
            )}

            {state === 'error' && (
              <p className="text-sm mt-4 text-red-500">
                {/* NO_EMAIL is the one failure worth explaining: a phone or
                    anonymous sign-in mints a valid token with no address, so
                    linking would create something that can never deliver. */}
                {error?.code === 'NO_EMAIL'
                  ? 'That account has no email address, so there is nowhere to send alerts. Sign in with a Google account instead.'
                  : error?.message || 'Could not turn on email alerts. Please try again.'}
              </p>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
