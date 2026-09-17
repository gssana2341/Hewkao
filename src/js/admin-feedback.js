import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase.js';
import { openLoginModal } from './auth.js';
import { escapeHTML, showToast } from './utils.js';

/* =========================================================================
   HEWKAO — feedback inbox, dev-only.

   Not a real feature page: visiting ?admin=feedback shows submissions
   in-app instead of digging through the Firebase console every time. Gated
   by Firestore rules (see firestore.rules) to the owner's email specifically,
   so this file's existence doesn't itself expose anything — a stranger
   loading the URL just gets asked to log in, then an empty/denied read.
   ========================================================================= */

const OWNER_EMAIL = 'zoomgamer807@gmail.com';

function isRequested() {
  return new URLSearchParams(window.location.search).get('admin') === 'feedback';
}

function buildPanel() {
  if (document.getElementById('adminFeedbackPanel')) return;
  const wrap = document.createElement('div');
  wrap.id = 'adminFeedbackPanel';
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal admin-feedback-modal" role="dialog" aria-modal="true">
      <h3>ความคิดเห็นจากผู้ใช้</h3>
      <div id="adminFeedbackList" class="admin-feedback-list"><p class="modal-sub">กำลังโหลด...</p></div>
      <div class="modal-actions">
        <button id="adminFeedbackCloseBtn" type="button" class="btn btn-secondary btn-block">ปิด</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#adminFeedbackCloseBtn').addEventListener('click', () => { wrap.hidden = true; });
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.hidden = true; });
}

async function loadAndShow() {
  buildPanel();
  document.getElementById('adminFeedbackPanel').hidden = false;
  const listEl = document.getElementById('adminFeedbackList');
  try {
    const snap = await getDocs(query(collection(db, 'feedback'), orderBy('createdAt', 'desc')));
    if (snap.empty) {
      listEl.innerHTML = '<p class="modal-sub">ยังไม่มีความคิดเห็น</p>';
      return;
    }
    listEl.innerHTML = snap.docs.map(d => {
      const f = d.data();
      const date = f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString('th-TH') : '';
      return `<div class="admin-feedback-item">
        <p class="admin-feedback-message">${escapeHTML(f.message || '')}</p>
        <p class="admin-feedback-meta">${escapeHTML(f.email || 'ไม่ระบุอีเมล')} · ${date}</p>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('[HEWKAO] load feedback failed:', err);
    listEl.innerHTML = '<p class="modal-sub">โหลดไม่สำเร็จ (ต้อง login ด้วยอีเมลของเจ้าของแอปก่อน)</p>';
  }
}

if (isRequested() && auth) {
  const unsubscribe = onAuthStateChanged(auth, user => {
    unsubscribe();
    if (user?.email === OWNER_EMAIL) {
      loadAndShow();
    } else {
      showToast('หน้านี้ต้องเข้าสู่ระบบด้วยอีเมลของเจ้าของแอปก่อน');
      openLoginModal();
    }
  });
}
