import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { getCurrentUser } from '../api';

const provider = new GoogleAuthProvider();

/**
 * Google sign-in, then exchange the Firebase ID token for the backend profile.
 *
 * The ID token is deliberately not logged. It is a bearer credential — anything
 * holding it can act as this user until it expires, and console output is
 * readable by every extension the visitor has installed.
 */
export async function login() {
  const result = await signInWithPopup(auth, provider);
  const token = await result.user.getIdToken();
  const { user: profile, isNew } = await getCurrentUser(token);
  return { user: result.user, profile, isNew };
}

export function logout() {
  return signOut(auth);
}
