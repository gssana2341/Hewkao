import { escapeHTML, showToast } from './utils.js';
import { DEMO_MODE } from './constants.js';
import { isLoggedIn as authIsLoggedIn, getPhone, openLoginModal, logout } from './auth.js';
import { openPaywall, getTotalSpinsRemaining } from './subscription.js';
import { open as openCheckin, hasClaimedToday, getStreak } from './checkin.js';

/* =========================================================================
   HEWKAO — profile panel (top-right button).

   Reads everything through auth's, subscription's and checkin's public
   exports only — this file owns no localStorage keys of its own.
   ========================================================================= */

function buildModal() {
  if (document.getElementById('profileModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'profileModal';
  wrap.className = 'modal-backdrop';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
      <h3 id="profileTitle">โปรไฟล์</h3>
      <div id="profileContent"></div>
      <div class="modal-actions">
        <button id="profileCloseBtn" type="button" class="btn btn-secondary btn-block">ปิด</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('#profileCloseBtn').addEventListener('click', close);

  // Event delegation — renderContent() rewrites #profileContent's innerHTML
  // on every open/re-render, so listeners are attached once here instead of
  // being re-bound (and leaked) each time.
  wrap.querySelector('#profileContent').addEventListener('click', e => {
    if (e.target.closest('#profileLoginBtn')) {
      close();
      openLoginModal();
    } else if (e.target.closest('#profileLogoutBtn')) {
      logout();
      showToast('ออกจากระบบแล้ว');
      renderContent();
    } else if (e.target.closest('#profileManageBtn')) {
      close();
      openPaywall();
    } else if (e.target.closest('#profileCheckinBtn')) {
      // open(), not maybeShow(): the once-a-day guard made this button a
      // no-op on any day the popup had already appeared.
      close();
      openCheckin();
    }
  });
}

function loginSectionHTML() {
  // Phone login is a local simulation (any 6-digit code passes), so it only
  // shows in demo mode — the public site shouldn't collect phone numbers
  // until real OTP verification exists.
  if (!DEMO_MODE) return '';
  const body = authIsLoggedIn()
    ? `<p class="profile-phone">${escapeHTML(getPhone())}</p>
       <button id="profileLogoutBtn" type="button" class="btn btn-secondary btn-block">ออกจากระบบ</button>`
    : `<p class="profile-login-status">ยังไม่ได้เข้าสู่ระบบ</p>
       <button id="profileLoginBtn" type="button" class="btn btn-primary btn-block">เข้าสู่ระบบด้วยเบอร์มือถือ</button>`;
  return `<div class="profile-section">${body}</div>`;
}

function renderContent() {
  const spins = getTotalSpinsRemaining();
  const claimedToday = hasClaimedToday();

  const checkinStatusHTML = claimedToday
    ? `เช็คอินวันนี้แล้ว (Day ${getStreak()}/7)`
    : 'ยังไม่ได้เช็คอินวันนี้';

  document.getElementById('profileContent').innerHTML = `
    ${loginSectionHTML()}
    <div class="profile-section profile-section-row">
      <span class="profile-label">สปินคงเหลือ</span>
      <span class="profile-spin-count">${spins}</span>
    </div>
    <div class="profile-section profile-section-row">
      <span class="profile-label">${checkinStatusHTML}</span>
      <button id="profileCheckinBtn" type="button" class="btn btn-secondary profile-checkin-btn">${claimedToday ? 'ดูสตรีค' : 'เช็คอิน'}</button>
    </div>
    <button id="profileManageBtn" type="button" class="btn btn-secondary btn-block">${DEMO_MODE ? 'จัดการแพ็ก' : 'HEWKAO+'}</button>
    <p class="profile-privacy-link"><a href="/privacy.html" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a></p>`;
}

export function open() {
  buildModal();
  renderContent();
  document.getElementById('profileModal').hidden = false;
}

export function close() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.hidden = true;
}

document.getElementById('profileBtn').addEventListener('click', open);
