import {
  onAuthStateChanged, signInAnonymously, signOut,
  EmailAuthProvider, linkWithCredential, signInWithEmailLink, isSignInWithEmailLink,
  sendSignInLinkToEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { showToast } from './utils.js';
import { auth, db } from './firebase.js';
import { attachUser, getCache, patch } from './user-data.js';

/* =========================================================================
   HEWKAO — email-link login, backed by Firebase Auth.

   Every visitor is signed in anonymously on load (invisible — no UI, no
   prompt) so spins/streak persist to Firestore from the very first visit.
   Logging in sends a passwordless sign-in link to the user's email
   (sendSignInLinkToEmail) instead of an SMS OTP — Firebase Phone Auth needs
   the paid Blaze plan and per-SMS billing; email links are free on every
   plan and need no backend. Completing the link is done via
   linkWithCredential so it merges onto the anonymous account (existing
   progress carries over) unless that email already belongs to a different
   account (auth/credential-already-in-use), in which case we sign into that
   one instead — same fallback shape the old phone flow used.

   The phone number collected alongside the email is NOT SMS-verified (that
   would bring back per-signup billing). It's stored as a Firestore
   "phoneIndex/{phone}" doc that security rules only allow to be *created*,
   never overwritten — so one phone number can only ever be claimed by one
   account, which is enough to stop the "spam with a throwaway email + fake
   phone every time" pattern without paying for SMS.
   ========================================================================= */

const PENDING_EMAIL_KEY = 'hewkao_pending_email';
const PENDING_PHONE_KEY = 'hewkao_pending_phone';

const PHONE_RE = /^0[689]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isLoggedIn() {
  return !!auth?.currentUser && !auth.currentUser.isAnonymous;
}

export function getEmail() {
  return auth?.currentUser?.email || '';
}

export function getPhone() {
  return getCache().phone || '';
}

export function logout() {
  if (!auth) return;
  signOut(auth).catch(err => console.error('[HEWKAO] sign out failed:', err));
  // signOut fires onAuthStateChanged with user=null, which signs back in
  // anonymously below — logging out must not block spinning.
}

function continueUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

// One phone number -> one account. Firestore rules only allow *creating*
// this doc (never updating), so a second account trying to claim the same
// phone gets permission-denied — that's the anti-spam check, not a bug.
async function bindPhoneToAccount(uid, phone) {
  if (!db || !phone) return;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.data()?.phone === phone) return; // already bound to this account
    await setDoc(doc(db, 'phoneIndex', phone), { uid });
    patch({ phone });
  } catch (err) {
    if (err?.code === 'permission-denied') {
      showToast('เบอร์นี้ผูกกับบัญชีอื่นอยู่แล้ว เข้าสู่ระบบสำเร็จ แต่ยังไม่ได้ผูกเบอร์นี้');
    } else {
      console.error('[HEWKAO] bind phone failed:', err);
    }
  }
}

async function completeEmailSignIn(user, email) {
  if (user?.isAnonymous) {
    const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
    try {
      await linkWithCredential(user, credential);
      return;
    } catch (err) {
      if (err?.code !== 'auth/credential-already-in-use' && err?.code !== 'auth/email-already-in-use') throw err;
      // This email already has its own account/history — sign into that one
      // instead of the (now-abandoned) anonymous account.
    }
  }
  await signInWithEmailLink(auth, email, window.location.href);
}

async function handleEmailLinkCompletion(user) {
  let email = window.localStorage.getItem(PENDING_EMAIL_KEY);
  const phone = window.localStorage.getItem(PENDING_PHONE_KEY) || '';

  if (!email) {
    email = await promptForEmail();
    if (!email) return;
  }

  try {
    await completeEmailSignIn(user, email);
    window.localStorage.removeItem(PENDING_EMAIL_KEY);
    window.localStorage.removeItem(PENDING_PHONE_KEY);
    window.history.replaceState({}, '', continueUrl());
    if (phone) await bindPhoneToAccount(auth.currentUser.uid, phone);
    closeLoginModal();
    showToast('เข้าสู่ระบบสำเร็จ');
  } catch (err) {
    console.error('[HEWKAO] email link sign-in failed:', err);
    showToast('ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ ลองส่งใหม่อีกครั้ง');
  }
}

/* ---------- Modal (built once, on demand) ---------- */
function buildModal() {
  if (document.getElementById('authModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'authModal';
  wrap.className = 'modal-backdrop';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <h3 id="authTitle">เข้าสู่ระบบด้วยอีเมล</h3>

      <div id="authStepForm" class="auth-step">
        <p class="modal-sub">กรอกอีเมลและเบอร์มือถือ เราจะส่งลิงก์ยืนยันไปที่อีเมลของคุณ</p>
        <input type="email" id="authEmailInput" class="auth-input" placeholder="you@example.com" autocomplete="email">
        <input type="tel" inputmode="numeric" id="authPhoneInput" class="auth-input" placeholder="08X-XXX-XXXX" autocomplete="tel">
        <p class="auth-note">เบอร์นี้จะผูกกับอีเมลนี้ และใช้ได้กับบัญชีเดียวเท่านั้น</p>
        <div class="modal-actions">
          <button id="authCancelBtn" type="button" class="btn btn-secondary">ยกเลิก</button>
          <button id="authSendLinkBtn" type="button" class="btn btn-primary">ส่งลิงก์ยืนยัน</button>
        </div>
      </div>

      <div id="authStepSent" class="auth-step" hidden>
        <p class="modal-sub" id="authSentSub">เราส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว เปิดอีเมลแล้วกดลิงก์เพื่อเข้าสู่ระบบ</p>
        <div class="modal-actions">
          <button id="authSentCloseBtn" type="button" class="btn btn-primary">ปิด</button>
        </div>
      </div>

      <div id="authStepConfirmEmail" class="auth-step" hidden>
        <p class="modal-sub">กรอกอีเมลที่คุณใช้ตอนขอลิงก์เข้าสู่ระบบ เพื่อยืนยันอีกครั้ง</p>
        <input type="email" id="authConfirmEmailInput" class="auth-input" placeholder="you@example.com" autocomplete="email">
        <div class="modal-actions">
          <button id="authConfirmCancelBtn" type="button" class="btn btn-secondary">ยกเลิก</button>
          <button id="authConfirmBtn" type="button" class="btn btn-primary">ยืนยัน</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const formStep = wrap.querySelector('#authStepForm');
  const sentStep = wrap.querySelector('#authStepSent');
  const emailInput = wrap.querySelector('#authEmailInput');
  const phoneInput = wrap.querySelector('#authPhoneInput');
  const sentSub = wrap.querySelector('#authSentSub');
  const sendBtn = wrap.querySelector('#authSendLinkBtn');

  wrap.addEventListener('click', e => { if (e.target === wrap) closeLoginModal(); });
  wrap.querySelector('#authCancelBtn').addEventListener('click', closeLoginModal);
  wrap.querySelector('#authSentCloseBtn').addEventListener('click', closeLoginModal);

  sendBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const phone = phoneInput.value.replace(/\D/g, '');
    if (!EMAIL_RE.test(email)) {
      showToast('กรอกอีเมลให้ถูกต้อง');
      return;
    }
    if (!PHONE_RE.test(phone)) {
      showToast('กรอกเบอร์มือถือ 10 หลัก เช่น 0812345678');
      return;
    }
    sendBtn.disabled = true;
    try {
      window.localStorage.setItem(PENDING_EMAIL_KEY, email);
      window.localStorage.setItem(PENDING_PHONE_KEY, phone);
      await sendSignInLinkToEmail(auth, email, { url: continueUrl(), handleCodeInApp: true });
      sentSub.textContent = `เราส่งลิงก์ยืนยันไปที่ ${email} แล้ว เปิดอีเมลแล้วกดลิงก์เพื่อเข้าสู่ระบบ`;
      formStep.hidden = true;
      sentStep.hidden = false;
    } catch (err) {
      console.error('[HEWKAO] send sign-in link failed:', err);
      showToast(err?.code === 'auth/invalid-email'
        ? 'อีเมลไม่ถูกต้อง'
        : 'ส่งลิงก์ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      sendBtn.disabled = false;
    }
  });
}

function promptForEmail() {
  buildModal();
  document.getElementById('authStepForm').hidden = true;
  document.getElementById('authStepSent').hidden = true;
  document.getElementById('authStepConfirmEmail').hidden = false;
  document.getElementById('authModal').hidden = false;

  const confirmBtn = document.getElementById('authConfirmBtn');
  const cancelBtn = document.getElementById('authConfirmCancelBtn');
  const input = document.getElementById('authConfirmEmailInput');
  input.value = '';

  return new Promise(resolve => {
    const onConfirm = () => {
      const email = input.value.trim();
      if (!EMAIL_RE.test(email)) {
        showToast('กรอกอีเมลให้ถูกต้อง');
        return;
      }
      cleanup();
      resolve(email);
    };
    const onCancel = () => { cleanup(); resolve(null); closeLoginModal(); };
    function cleanup() {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
    }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
  });
}

export function openLoginModal() {
  if (!auth) {
    showToast('ระบบล็อกอินยังไม่พร้อมใช้งาน');
    return;
  }
  buildModal();
  document.getElementById('authStepForm').hidden = false;
  document.getElementById('authStepSent').hidden = true;
  document.getElementById('authStepConfirmEmail').hidden = true;
  document.getElementById('authEmailInput').value = '';
  document.getElementById('authPhoneInput').value = '';
  document.getElementById('authModal').hidden = false;
}

function closeLoginModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.hidden = true;
}

/* ---------- Auth state wiring (self-registering, same pattern as the rest
   of the app's modules) ---------- */
if (auth) {
  let emailLinkHandled = false;
  onAuthStateChanged(auth, user => {
    if (!emailLinkHandled && isSignInWithEmailLink(auth, window.location.href)) {
      emailLinkHandled = true;
      handleEmailLinkCompletion(user);
      return;
    }
    if (!user) {
      signInAnonymously(auth).catch(err => console.error('[HEWKAO] anonymous sign-in failed:', err));
      return;
    }
    attachUser(user.uid);
  });
}
