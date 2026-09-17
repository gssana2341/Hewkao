import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';

/* =========================================================================
   HEWKAO — Firebase app init.

   Config values come from .env (see .env.example) — they identify the
   project, not secrets; access is controlled by Firestore security rules,
   not by hiding these. persistentLocalCache gives Firestore reads the same
   "instant on repeat visits" feel localStorage had, backed by IndexedDB.

   Guarded behind `firebaseReady`: getAuth() throws *synchronously* on a
   missing/malformed API key, and a throw at module-eval time here would
   break every module that (transitively) imports this one — including the
   spin button's own dependency chain. Login/cloud-sync are optional; the
   core "open app, spin, find food" flow must never be able to go down
   because a Firebase key is missing or misconfigured, so an absent .env (or
   a real key that hasn't been set up yet in production) just disables
   Firebase-backed features instead of crashing the app.
   ========================================================================= */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Object.values(firebaseConfig).every(Boolean);

let authInstance = null;
let dbInstance = null;

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = initializeFirestore(app, { localCache: persistentLocalCache() });
} else {
  console.warn('[HEWKAO] Firebase not configured (missing VITE_FIREBASE_* in .env) — login and cloud sync are disabled; spinning still works locally.');
}

export const auth = authInstance;
export const db = dbInstance;
