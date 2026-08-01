// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBse8Eep3CuNbPq6aga2P80eqRfzpnj0WU",
  authDomain: "ocularx-59561.firebaseapp.com",
  projectId: "ocularx-59561",
  storageBucket: "ocularx-59561.firebasestorage.app",
  messagingSenderId: "535575554535",
  appId: "1:535575554535:web:a7a1963811fa4be9963542",
  measurementId: "G-HC2VRWM9QK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);