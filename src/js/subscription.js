import { showToast } from './utils.js';
import { DEMO_MODE } from './constants.js';
import { open as openCheckin, hasClaimedToday } from './checkin.js';
import { getCache, patch, subscribe } from './user-data.js';

/* =========================================================================
   HEWKAO+ — spin credit wallet & subscription paywall.

   Wallet state (free spins used today, purchased credits) lives in the
   Firestore user doc via user-data.js, not localStorage — so it survives a
   cleared browser and can't be edited from devtools as trivially as a
   localStorage key (real anti-cheat still needs the spin logic itself to
   move server-side, planned separately). subscribe(updateBadge) keeps the
   badge in sync when that doc loads or changes from elsewhere.

   Buying a plan is still a *local simulation*: there is no payment gateway
   wired up yet, so "buying" just credits spins instantly — which is why the
   plans only render in DEMO_MODE (see constants.js). Swap the body of
   simulatePurchase() for a real checkout call once a provider (Omise / 2C2P
   / PromptPay / Stripe, etc.) is chosen — everything else (wallet balance,
   badge, paywall UI) stays the same.
   ========================================================================= */

const FREE_DAILY_LIMIT = 5;

// Adjust prices/spins here — nothing else needs to change.
const PLANS = [
  { id: 'p69',  price: 69,  spins: 100,  name: 'แพ็กเริ่มต้น' },
  { id: 'p129', price: 129, spins: 250,  name: 'แพ็กสุดคุ้ม', highlight: true },
  { id: 'p599', price: 599, spins: 1500, name: 'แพ็กจัดเต็ม' },
];

function todayKey() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function resetFreeSpinsIfNewDay() {
  if (getCache().freeSpinDate !== todayKey()) {
    patch({ freeSpinDate: todayKey(), freeSpinUsed: 0 });
  }
}

function getFreeSpinsRemaining() {
  resetFreeSpinsIfNewDay();
  return Math.max(0, FREE_DAILY_LIMIT - (getCache().freeSpinUsed || 0));
}

function getPurchasedCredits() {
  return getCache().spinCredits || 0;
}

export function getTotalSpinsRemaining() {
  return getFreeSpinsRemaining() + getPurchasedCredits();
}

// For the profile page's inline breakdown — the two numbers that make up
// "สปินคงเหลือ" instead of just the total.
export function getSpinBreakdown() {
  return {
    freeRemaining: getFreeSpinsRemaining(),
    freeLimit: FREE_DAILY_LIMIT,
    purchasedCredits: getPurchasedCredits(),
  };
}

export function canSpin() {
  return getTotalSpinsRemaining() > 0;
}

// Free spins are used up before dipping into purchased credits.
export function consumeSpin() {
  resetFreeSpinsIfNewDay();
  if (getFreeSpinsRemaining() > 0) {
    patch({ freeSpinUsed: (getCache().freeSpinUsed || 0) + 1 });
  } else {
    patch({ spinCredits: Math.max(0, getPurchasedCredits() - 1) });
  }
  updateBadge();
}

// The one writer of the credits field — used by plan purchases and by the
// daily check-in reward alike.
export function addCredits(n) {
  patch({ spinCredits: getPurchasedCredits() + n });
  updateBadge();
}

function manageSpinsLabel(remaining) {
  return DEMO_MODE
    ? `เติมสปิน / จัดการแพ็ก HEWKAO+ (เหลือ ${remaining} ครั้ง)`
    : `HEWKAO+ · เหลือสปิน ${remaining} ครั้ง`;
}

/* ---------- Badge on the spin button ---------- */
// A ticket icon, not just a bare number: a floating "5" on its own doesn't
// say what it's counting, especially once credits (check-in streaks, bought
// packs) push it well past a single digit. Capped at 99+ too — an
// uncapped count from repeated testing/top-ups reads as a broken counter,
// not a big number.
const BADGE_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4z"/></svg>';
const BADGE_MAX_DISPLAY = 99;

export function updateBadge() {
  const remaining = getTotalSpinsRemaining();
  const badge = document.getElementById('spinCountBadge');
  if (badge) {
    const count = badge.querySelector('.spin-count-badge-num');
    if (count) count.textContent = remaining > BADGE_MAX_DISPLAY ? `${BADGE_MAX_DISPLAY}+` : remaining;
    badge.classList.toggle('spin-count-empty', remaining === 0);
  }
  const manageBtn = document.getElementById('manageSpinsBtn');
  if (manageBtn) manageBtn.textContent = manageSpinsLabel(remaining);
}

function injectBadge() {
  const spinBtn = document.getElementById('spinBtn');
  if (!spinBtn || document.getElementById('spinCountBadge')) return;
  const badge = document.createElement('span');
  badge.id = 'spinCountBadge';
  badge.className = 'spin-count-badge';
  badge.title = 'จำนวนครั้งสุ่มที่เหลือวันนี้ — กดเพื่อดูรายละเอียด';
  badge.innerHTML = `${BADGE_ICON}<span class="spin-count-badge-num"></span>`;
  badge.addEventListener('click', e => {
    e.stopPropagation();
    openPaywall();
  });
  spinBtn.appendChild(badge);
  updateBadge();
}

/* ---------- Paywall modal (built once, on demand) ---------- */
function planCardHTML(plan) {
  return `
    <div class="plan-card ${plan.highlight ? 'plan-highlight' : ''}">
      ${plan.highlight ? '<span class="plan-badge">ยอดนิยม</span>' : ''}
      <div class="plan-info">
        <div class="plan-price">฿${plan.price}<span class="plan-per"> · จ่ายครั้งเดียว</span></div>
        <div class="plan-spins">+${plan.spins.toLocaleString('en-US')} สุ่ม</div>
      </div>
      <button type="button" class="btn btn-primary plan-btn" data-plan="${plan.id}">เลือก</button>
    </div>`;
}

// The public site gets a "coming soon" note instead of plans: a fake checkout
// that hands out spins for free has no business being live.
function paywallBodyHTML() {
  if (DEMO_MODE) {
    return `
      <div class="plan-list">${PLANS.map(planCardHTML).join('')}</div>
      <p class="paywall-note">โหมดทดลอง — ยังไม่เชื่อมระบบชำระเงินจริง กดเลือกแพ็กจะเติมสปินให้ทันทีเพื่อทดสอบ</p>`;
  }
  return `
    <div class="paywall-soon">
      <p class="paywall-soon-title">HEWKAO+ กำลังจะมา</p>
      <p>สุ่มไม่อั้น สุ่มกับเพื่อน และลูกเล่นกวนๆ อีกเพียบ ระหว่างนี้กดเลือกร้านจากรายการได้ไม่จำกัด และพรุ่งนี้รับสปินฟรีใหม่ ${FREE_DAILY_LIMIT} ครั้ง</p>
    </div>`;
}

function buildModal() {
  if (document.getElementById('paywallModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'paywallModal';
  wrap.className = 'modal-backdrop';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
      <h3 id="paywallTitle">HEWKAO+</h3>
      <p class="modal-sub" id="paywallSub"></p>
      ${paywallBodyHTML()}
      <button id="paywallCheckinBtn" type="button" class="btn btn-primary btn-block paywall-checkin-btn" hidden>เช็คอินรับสปินฟรีวันนี้</button>
      <div class="modal-actions">
        <button id="paywallClose" type="button" class="btn btn-secondary btn-block">ปิด</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelector('#paywallClose').addEventListener('click', closePaywall);
  wrap.addEventListener('click', e => { if (e.target === wrap) closePaywall(); });
  wrap.querySelector('#paywallCheckinBtn').addEventListener('click', () => {
    closePaywall();
    openCheckin();
  });
  wrap.querySelectorAll('.plan-btn').forEach(btn => {
    btn.addEventListener('click', () => simulatePurchase(btn.dataset.plan));
  });
}

export function openPaywall() {
  buildModal();
  const remaining = getTotalSpinsRemaining();
  document.getElementById('paywallTitle').textContent = remaining === 0 ? 'สปินวันนี้หมดแล้ว' : 'HEWKAO+';
  document.getElementById('paywallSub').textContent =
    `วันนี้เหลือฟรี ${getFreeSpinsRemaining()} ครั้ง · มีเครดิตสะสม ${getPurchasedCredits()} ครั้ง`;
  document.getElementById('paywallCheckinBtn').hidden = hasClaimedToday();
  document.getElementById('paywallModal').hidden = false;
}

function closePaywall() {
  const modal = document.getElementById('paywallModal');
  if (modal) modal.hidden = true;
}

function simulatePurchase(planId) {
  const plan = PLANS.find(p => p.id === planId);
  if (!plan) return;
  addCredits(plan.spins);
  closePaywall();
  showToast(`เติมสำเร็จ +${plan.spins.toLocaleString('en-US')} สุ่ม (โหมดทดลอง ยังไม่หักเงินจริง)`);
}

/* ---------- Entry point inside the existing settings popup ---------- */
// Answers "where's the billing page?" — there isn't a separate page, but this
// gives it a second, more discoverable door besides the small badge.
function injectPrefsLink() {
  const modalActions = document.querySelector('#prefsModal .modal-actions');
  if (!modalActions || document.getElementById('manageSpinsBtn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'manageSpinsBtn';
  btn.className = 'btn btn-secondary btn-block manage-spins-btn';
  btn.textContent = manageSpinsLabel(getTotalSpinsRemaining());
  btn.addEventListener('click', () => {
    document.getElementById('prefsModal').hidden = true;
    openPaywall();
  });
  modalActions.parentNode.insertBefore(btn, modalActions);
}

injectBadge();
injectPrefsLink();
subscribe(updateBadge);
