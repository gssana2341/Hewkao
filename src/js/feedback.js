import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { showToast } from './utils.js';
import { auth, db } from './firebase.js';
import { getEmail } from './auth.js';

/* =========================================================================
   HEWKAO — feedback button (top bar, next to the profile button).

   Free-text only on purpose: this is for the owner to hear what to adjust
   next, not a support inbox, so it doesn't need categories or a rating.
   Write-only from the client (see firestore.rules) — submissions are read
   back through the Firebase console, no in-app admin view.
   ========================================================================= */

const MAX_LENGTH = 2000;

function buildModal() {
  if (document.getElementById('feedbackModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'feedbackModal';
  wrap.className = 'modal-backdrop';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle">
      <h3 id="feedbackTitle">ส่งความคิดเห็น</h3>
      <p class="modal-sub">อยากให้ HEWKAO ปรับอะไร บอกเราได้เลย</p>
      <textarea id="feedbackTextarea" class="feedback-textarea" maxlength="${MAX_LENGTH}" placeholder="เช่น อยากให้เพิ่ม..."></textarea>
      <div class="modal-actions">
        <button id="feedbackCancelBtn" type="button" class="btn btn-secondary">ยกเลิก</button>
        <button id="feedbackSendBtn" type="button" class="btn btn-primary">ส่ง</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const textarea = wrap.querySelector('#feedbackTextarea');
  const sendBtn = wrap.querySelector('#feedbackSendBtn');

  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('#feedbackCancelBtn').addEventListener('click', close);

  sendBtn.addEventListener('click', async () => {
    const message = textarea.value.trim();
    if (!message) {
      showToast('พิมพ์ความคิดเห็นก่อนส่งนะ');
      return;
    }
    if (!db || !auth?.currentUser) {
      showToast('ส่งไม่สำเร็จ ลองอีกครั้ง');
      return;
    }
    sendBtn.disabled = true;
    try {
      await addDoc(collection(db, 'feedback'), {
        uid: auth.currentUser.uid,
        email: getEmail() || null,
        message,
        createdAt: serverTimestamp(),
      });
      showToast('ขอบคุณสำหรับความคิดเห็น!');
      close();
    } catch (err) {
      console.error('[HEWKAO] send feedback failed:', err);
      showToast('ส่งไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      sendBtn.disabled = false;
    }
  });
}

export function open() {
  buildModal();
  document.getElementById('feedbackTextarea').value = '';
  document.getElementById('feedbackModal').hidden = false;
}

function close() {
  const modal = document.getElementById('feedbackModal');
  if (modal) modal.hidden = true;
}

document.getElementById('feedbackBtn').addEventListener('click', open);
