import {
  onAuthStateChanged, signInAnonymously, signOut,
  GoogleAuthProvider, linkWithPopup, signInWithPopup,
} from 'firebase/auth';
import { showToast } from './utils.js';
import { auth } from './firebase.js';
import { attachUser } from './user-data.js';

/* =========================================================================
   HEWKAO — Google Sign-In, backed by Firebase Auth.

   Every visitor is signed in anonymously on load (invisible — no UI, no
   prompt) so spins/streak persist to Firestore from the very first visit.
   Logging in links a Google account onto that anonymous account
   (linkWithPopup) so existing progress carries over, unless that Google
   account already has its own history (auth/credential-already-in-use), in
   which case we sign into that one instead. Google Sign-In needs no billing
   plan (unlike Phone Auth's SMS) and no phone-dedup workaround (unlike a
   bare email link) — a Google account is itself a strong-enough identity to
   deter the "throwaway account every visit" pattern.
   ========================================================================= */

export function isLoggedIn() {
  return !!auth?.currentUser && !auth.currentUser.isAnonymous;
}

export function getEmail() {
  return auth?.currentUser?.email || '';
}

export function logout() {
  if (!auth) return;
  signOut(auth).catch(err => console.error('[HEWKAO] sign out failed:', err));
  // signOut fires onAuthStateChanged with user=null, which signs back in
  // anonymously below — logging out must not block spinning.
}

export async function login() {
  if (!auth) {
    showToast('ระบบล็อกอินยังไม่พร้อมใช้งาน');
    return;
  }
  const provider = new GoogleAuthProvider();
  try {
    const user = auth.currentUser;
    if (user?.isAnonymous) {
      try {
        await linkWithPopup(user, provider);
        showToast('เข้าสู่ระบบสำเร็จ');
        return;
      } catch (err) {
        if (err?.code !== 'auth/credential-already-in-use') throw err;
        // This Google account already has its own history — sign into that
        // one instead of the (now-abandoned) anonymous account.
      }
    }
    await signInWithPopup(auth, provider);
    showToast('เข้าสู่ระบบสำเร็จ');
  } catch (err) {
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
    console.error('[HEWKAO] google sign-in failed:', err);
    showToast('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง');
  }
}

/* ---------- Auth state wiring (self-registering, same pattern as the rest
   of the app's modules) ---------- */
if (auth) {
  onAuthStateChanged(auth, user => {
    if (!user) {
      signInAnonymously(auth).catch(err => console.error('[HEWKAO] anonymous sign-in failed:', err));
      return;
    }
    attachUser(user.uid);
  });
}
