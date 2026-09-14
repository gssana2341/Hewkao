import { showToast } from './utils.js';

/* =========================================================================
   HEWKAO — phone-number login.

   This is a *local simulation* only: there is no SMS/OTP provider wired up
   yet, so any 6-digit code is accepted as valid. Swap the body of
   verifyOtp() for a real call (Firebase Auth, Twilio Verify, ThaiBulkSMS,
   etc.) once a provider is chosen — everything else (modal, Auth API,
   profile integration) stays the same.
   ========================================================================= */

const PHONE_KEY = 'hewkao_user_phone';

let pendingPhone = '';

export function isLoggedIn() {
  return !!localStorage.getItem(PHONE_KEY);
}

export function getPhone() {
  return localStorage.getItem(PHONE_KEY) || '';
}

export function logout() {
  localStorage.removeItem(PHONE_KEY);
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
      <h3 id="authTitle">เข้าสู่ระบบด้วยเบอร์มือถือ</h3>

      <div id="authStepPhone" class="auth-step">
        <p class="modal-sub">กรอกเบอร์มือถือเพื่อรับรหัส OTP</p>
        <input type="tel" inputmode="numeric" id="authPhoneInput" class="auth-input" placeholder="08X-XXX-XXXX" autocomplete="tel">
        <div class="modal-actions">
          <button id="authCancelBtn" type="button" class="btn btn-secondary">ยกเลิก</button>
          <button id="authSendOtpBtn" type="button" class="btn btn-primary">ส่ง OTP</button>
        </div>
      </div>

      <div id="authStepOtp" class="auth-step" hidden>
        <p class="modal-sub" id="authOtpSub">กรอกรหัส 6 หลักที่ส่งไปที่เบอร์ของคุณ</p>
        <input type="tel" inputmode="numeric" maxlength="6" id="authOtpInput" class="auth-input auth-otp-input" placeholder="XXXXXX" autocomplete="one-time-code">
        <p class="auth-note">โหมดทดลอง — ใส่ตัวเลข 6 หลักอะไรก็ได้เพื่อยืนยัน</p>
        <div class="modal-actions">
          <button id="authBackBtn" type="button" class="btn btn-secondary">ย้อนกลับ</button>
          <button id="authVerifyBtn" type="button" class="btn btn-primary">ยืนยัน</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const phoneStep = wrap.querySelector('#authStepPhone');
  const otpStep = wrap.querySelector('#authStepOtp');
  const phoneInput = wrap.querySelector('#authPhoneInput');
  const otpInput = wrap.querySelector('#authOtpInput');
  const otpSub = wrap.querySelector('#authOtpSub');

  function showPhoneStep() {
    phoneStep.hidden = false;
    otpStep.hidden = true;
    otpInput.value = '';
  }
  function showOtpStep() {
    phoneStep.hidden = true;
    otpStep.hidden = false;
    otpSub.textContent = `กรอกรหัส 6 หลักที่ส่งไปที่ ${pendingPhone}`;
  }

  wrap.addEventListener('click', e => { if (e.target === wrap) closeLoginModal(); });
  wrap.querySelector('#authCancelBtn').addEventListener('click', closeLoginModal);
  wrap.querySelector('#authBackBtn').addEventListener('click', showPhoneStep);

  wrap.querySelector('#authSendOtpBtn').addEventListener('click', () => {
    const phone = phoneInput.value.replace(/\D/g, '');
    // Thai mobile numbers: 10 digits starting with 06, 08 or 09.
    if (!/^0[689]\d{8}$/.test(phone)) {
      showToast('กรอกเบอร์มือถือ 10 หลัก เช่น 0812345678');
      return;
    }
    pendingPhone = phone;
    showOtpStep();
    showToast('ส่งรหัส OTP แล้ว (โหมดทดลอง)');
  });

  wrap.querySelector('#authVerifyBtn').addEventListener('click', () => {
    const code = otpInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      showToast('กรอกรหัส OTP 6 หลัก');
      return;
    }
    verifyOtp();
  });
}

// Local simulation only — accepts any 6-digit code as valid. Swap this body
// for a real OTP verification call once a provider is chosen.
function verifyOtp() {
  localStorage.setItem(PHONE_KEY, pendingPhone);
  closeLoginModal();
  showToast('เข้าสู่ระบบสำเร็จ');
}

export function openLoginModal() {
  buildModal();
  pendingPhone = '';
  document.getElementById('authStepPhone').hidden = false;
  document.getElementById('authStepOtp').hidden = true;
  document.getElementById('authPhoneInput').value = '';
  document.getElementById('authOtpInput').value = '';
  document.getElementById('authModal').hidden = false;
}

function closeLoginModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.hidden = true;
}
