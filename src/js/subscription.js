import { showToast } from './utils.js';
import { DEMO_MODE } from './constants.js';
import { open as openCheckin, hasClaimedToday } from './checkin.js';

/* =========================================================================
   HEWKAO+ — spin credit wallet & subscription paywall.

   Buying a plan is a *local simulation* only: there is no payment gateway
   wired up yet, so "buying" just credits spins on this browser instantly —
   which is why the plans only render in DEMO_MODE (see constants.js). Swap
   the body of simulatePurchase() for a real checkout call once a provider
   (Omise / 2C2P / PromptPay / Stripe, etc.) is chosen — everything else
   (wallet balance, badge, paywall UI) stays the same.
   ========================================================================= */

const FREE_DAILY_LIMIT = 5;

// Adjust prices/spins here — nothing else needs to change.
const PLANS = [
  { id: 'p69',  price: 69,  spins: 100,  name: 'แพ็กเริ่มต้น' },
  { id: 'p129', price: 129, spins: 250,  name: 'แพ็กสุดคุ้ม', highlight: true },
  { id: 'p599', price: 599, spins: 1500, name: 'แพ็กจัดเต็ม' },
];

const FREE_DATE_KEY = 'hewkao_free_spin_date';
const FREE_USED_KEY = 'hewkao_free_spin_used';
const CREDITS_KEY = 'hewkao_spin_credits';

function todayKey() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function resetFreeSpinsIfNewDay() {
  if (localStorage.getItem(FREE_DATE_KEY) !== todayKey()) {
    localStorage.setItem(FREE_DATE_KEY, todayKey());
    localStorage.setItem(FREE_USED_KEY, '0');
  }
}

function getFreeSpinsRemaining() {
  resetFreeSpinsIfNewDay();
  const used = parseInt(localStorage.getItem(FREE_USED_KEY) || '0', 10);
  return Math.max(0, FREE_DAILY_LIMIT - used);
}

function getPurchasedCredits() {
  return parseInt(localStorage.getItem(CREDITS_KEY) || '0', 10);
}

export function getTotalSpinsRemaining() {
  return getFreeSpinsRemaining() + getPurchasedCredits();
}

export function canSpin() {
  return getTotalSpinsRemaining() > 0;
}

// Free spins are used up before dipping into purchased credits.
export function consumeSpin() {
  resetFreeSpinsIfNewDay();
  if (getFreeSpinsRemaining() > 0) {
    const used = parseInt(localStorage.getItem(FREE_USED_KEY) || '0', 10);
    localStorage.setItem(FREE_USED_KEY, String(used + 1));
  } else {
    localStorage.setItem(CREDITS_KEY, String(Math.max(0, getPurchasedCredits() - 1)));
  }
  updateBadge();
}

// The one writer of the credits key — used by plan purchases and by the daily
// check-in reward alike.
export function addCredits(n) {
  localStorage.setItem(CREDITS_KEY, String(getPurchasedCredits() + n));
  updateBadge();
}

function manageSpinsLabel(remaining) {
  return DEMO_MODE
    ? `เติมสปิน / จัดการแพ็ก HEWKAO+ (เหลือ ${remaining} ครั้ง)`
    : `HEWKAO+ · เหลือสปิน ${remaining} ครั้ง`;
}

/* ---------- Badge on the spin button ---------- */
export function updateBadge() {
  const remaining = getTotalSpinsRemaining();
  const badge = document.getElementById('spinCountBadge');
  if (badge) {
    badge.textContent = remaining;
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
