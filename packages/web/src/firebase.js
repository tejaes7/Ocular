import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// This config is safe to commit. A Firebase web apiKey is a public client
// identifier, not a secret — it ships in every browser bundle by design. What
// actually restricts access is the Authorized Domains list in Firebase Auth plus
// your Firestore/Storage rules, so keep those tight rather than hiding this.
const firebaseConfig = {
  apiKey: 'AIzaSyBse8Eep3CuNbPq6aga2P80eqRfzpnj0WU',
  authDomain: 'ocularx-59561.firebaseapp.com',
  projectId: 'ocularx-59561',
  storageBucket: 'ocularx-59561.firebasestorage.app',
  messagingSenderId: '535575554535',
  appId: '1:535575554535:web:a7a1963811fa4be9963542',
  measurementId: 'G-HC2VRWM9QK',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
