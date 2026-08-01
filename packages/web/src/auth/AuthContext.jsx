import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getCurrentUser } from '../api';
import { login, logout } from './login.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // True only for the sign-in that created the account. Reset on sign-out so a
  // second person signing in on the same tab is not greeted as a returning one.
  const [isNew, setIsNew] = useState(false);
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
          setIsNew(false);
          profileLoadedFor.current = null;
          return;
        }
        if (profileLoadedFor.current === nextUser.uid) return;

        // Page reload with a restored session: the backend profile is not in
        // memory, so fetch it from the token Firebase just handed back. This is
        // never a first sign-in — the account already existed to be restored.
        try {
          const token = await nextUser.getIdToken();
          const { user: nextProfile } = await getCurrentUser(token);
          setProfile(nextProfile);
          setIsNew(false);
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
      const { user: nextUser, profile: nextProfile, isNew: created } = await login();
      profileLoadedFor.current = nextUser.uid;
      setProfile(nextProfile);
      setIsNew(created);
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
    setIsNew(false);
    profileLoadedFor.current = null;
  }, []);

  const value = useMemo(
    () => ({ user, profile, isNew, pending, error, ready, signIn, signOut }),
    [user, profile, isNew, pending, error, ready, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
