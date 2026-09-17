import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';

/* =========================================================================
   HEWKAO — Firestore-backed user document (users/{uid}).

   Replaces the old per-file localStorage keys (spin credits, check-in
   streak, phone) with one doc per user, kept in this in-memory `cache` and
   synced live via onSnapshot. Callers (subscription.js, checkin.js, auth.js)
   read `getCache()` synchronously — same calling convention the old
   localStorage.getItem() reads had — and write through patch(), which
   updates the cache optimistically before the Firestore write resolves so
   the UI never waits on the network.
   ========================================================================= */

const DEFAULTS = {
  phone: '',
  freeSpinDate: '',
  freeSpinUsed: 0,
  spinCredits: 0,
  checkinStreak: 0,
  lastClaimDate: '',
  lastSeenDate: '',
};

let cache = { ...DEFAULTS };
let uid = null;
let unsubscribeSnapshot = null;
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(cache));
}

export function getCache() {
  return cache;
}

// Called whenever, so components can re-render on data they didn't write
// themselves (e.g. another tab claiming the daily check-in).
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-pointed at a new uid on every auth state change (anonymous sign-in,
// phone login, logout-then-anonymous). Each call tears down the previous
// doc's listener so it doesn't keep writing into a stale user's data.
export function attachUser(nextUid) {
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  uid = nextUid;
  cache = { ...DEFAULTS };
  notify();
  if (!uid || !db) return;

  const ref = doc(db, 'users', uid);
  unsubscribeSnapshot = onSnapshot(ref, snap => {
    cache = snap.exists() ? { ...DEFAULTS, ...snap.data() } : { ...DEFAULTS };
    if (!snap.exists()) setDoc(ref, cache).catch(err => console.error('[HEWKAO] create user doc failed:', err));
    notify();
  }, err => console.error('[HEWKAO] user doc listener failed:', err));
}

// Optimistic: updates the local cache immediately, then writes through.
// Callers don't await this — the badge/UI reflect `fields` before the
// network round-trip finishes, same as the old synchronous localStorage set.
export function patch(fields) {
  cache = { ...cache, ...fields };
  notify();
  if (!uid || !db) return;
  setDoc(doc(db, 'users', uid), fields, { merge: true })
    .catch(err => console.error('[HEWKAO] user doc write failed:', err));
}
