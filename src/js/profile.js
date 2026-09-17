import { escapeHTML, showToast } from './utils.js';
import { DEMO_MODE } from './constants.js';
import { isLoggedIn as authIsLoggedIn, getEmail, getPhone, openLoginModal, logout } from './auth.js';
import { openPaywall, getSpinBreakdown } from './subscription.js';
import { renderStripHTML, hasClaimedToday, getStreak, claim as claimCheckin } from './checkin.js';
import { subscribe } from './user-data.js';

/* =========================================================================
   HEWKAO — profile panel (top-right button).

   Reads everything through auth's, subscription's and checkin's public
   exports only — this file owns no localStorage keys of its own. Spin
   balance and the check-in strip render inline here (not just a button to a
   separate modal) so opening the profile page alone already shows what's
   going on — the paywall modal still owns picking/buying a plan, since that
   needs its own flow, but you never *need* it just to see where you stand.
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
    } else if (e.target.closest('#profileTopupBtn')) {
      close();
      openPaywall();
    } else if (e.target.closest('#profileClaimBtn')) {
      // No renderContent() call needed here: claimCheckin() -> patch()
      // notifies subscribers synchronously, and this file's own subscribe()
      // below already re-renders on any change while the modal is open.
      claimCheckin();
    }
  });
}

function loginSectionHTML() {
  // Login is a free email link + a (unverified, dedup-only) phone number —
  // see auth.js. No billing dependency, so it's live for everyone.
  const body = authIsLoggedIn()
    ? `<p class="profile-phone">${escapeHTML(getEmail())}</p>
       <p class="profile-phone">${escapeHTML(getPhone())}</p>
       <button id="profileLogoutBtn" type="button" class="btn btn-secondary btn-block">ออกจากระบบ</button>`
    : `<p class="profile-login-status">ยังไม่ได้เข้าสู่ระบบ</p>
       <button id="profileLoginBtn" type="button" class="btn btn-primary btn-block">เข้าสู่ระบบด้วยอีเมล</button>`;
  return `<div class="profile-section">${body}</div>`;
}

function spinSectionHTML() {
  const { freeRemaining, freeLimit, purchasedCredits } = getSpinBreakdown();
  return `
    <div class="profile-section profile-card">
      <div class="profile-card-header">
        <span class="profile-card-title">สปินคงเหลือ</span>
        <span class="profile-card-total">${freeRemaining + purchasedCredits}</span>
      </div>
      <div class="profile-stat-row">
        <span>ฟรีวันนี้</span>
        <span>${freeRemaining}/${freeLimit}</span>
      </div>
      <div class="profile-stat-row">
        <span>เครดิตสะสม</span>
        <span>${purchasedCredits}</span>
      </div>
      <button id="profileTopupBtn" type="button" class="btn btn-secondary btn-block">${DEMO_MODE ? 'เติมสปิน / จัดการแพ็ก' : 'HEWKAO+'}</button>
    </div>`;
}

function checkinSectionHTML() {
  const claimedToday = hasClaimedToday();
  return `
    <div class="profile-section profile-card">
      <div class="profile-card-header">
        <span class="profile-card-title">เช็คอินรายวัน</span>
        <span class="profile-card-total">Day ${getStreak() || 1}/7</span>
      </div>
      <div class="checkin-strip profile-checkin-strip">${renderStripHTML()}</div>
      <button id="profileClaimBtn" type="button" class="btn btn-primary btn-block" ${claimedToday ? 'disabled' : ''}>
        ${claimedToday ? 'รับแล้ววันนี้' : 'รับรางวัล'}
      </button>
    </div>`;
}

function renderContent() {
  document.getElementById('profileContent').innerHTML = `
    ${loginSectionHTML()}
    ${spinSectionHTML()}
    ${checkinSectionHTML()}
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
subscribe(() => {
  const modal = document.getElementById('profileModal');
  if (modal && !modal.hidden) renderContent();
});
