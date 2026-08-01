import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getCurrentUser } from '../api';
import { login, logout } from './login.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  // Undefined until Firebase reports the restored session, so the UI can avoid
  // flashing "Login" at someone who is already signed in.
  const [ready, setReady] = useState(false);

  // login() already fetches the profile. Without this, the auth-state listener
  // firing right after sign-in would fetch it a second time.
  const profileLoadedFor = useRef(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);
        setReady(true);

        if (!nextUser) {
          setProfile(null);
          profileLoadedFor.current = null;
          return;
        }
        if (profileLoadedFor.current === nextUser.uid) return;

        // Page reload with a restored session: the backend profile is not in
        // memory, so fetch it from the token Firebase just handed back.
        try {
          const token = await nextUser.getIdToken();
          setProfile(await getCurrentUser(token));
          profileLoadedFor.current = nextUser.uid;
        } catch (err) {
          // Signed in with Firebase but the backend rejected or is unreachable.
          // Keep the Firebase identity; surface the failure.
          setError(err);
        }
      }),
    []
  );

  const signIn = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      const { user: nextUser, profile: nextProfile } = await login();
      profileLoadedFor.current = nextUser.uid;
      setProfile(nextProfile);
      return nextProfile;
    } catch (err) {
      // Closing the Google popup is a normal action, not an error worth showing.
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setError(err);
      }
      throw err;
    } finally {
      setPending(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await logout();
    setProfile(null);
    profileLoadedFor.current = null;
  }, []);

  const value = useMemo(
    () => ({ user, profile, pending, error, ready, signIn, signOut }),
    [user, profile, pending, error, ready, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
