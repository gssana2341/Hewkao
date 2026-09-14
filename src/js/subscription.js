import { showToast } from './utils.js';

/* =========================================================================
   HEWKAO+ — spin credit wallet & subscription paywall.

   This is a *local simulation* only: there is no payment gateway wired up
   yet, so "buying" a plan just credits spins on this browser instantly.
   Swap the body of simulatePurchase() for a real checkout call once a
   provider (Omise / 2C2P / PromptPay / Stripe, etc.) is chosen — everything
   else (wallet balance, badge, paywall UI) stays the same.
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

/* ---------- Badge on the spin button ---------- */
export function updateBadge() {
  const remaining = getTotalSpinsRemaining();
  const badge = document.getElementById('spinCountBadge');
  if (badge) {
    badge.textContent = remaining;
    badge.classList.toggle('spin-count-empty', remaining === 0);
  }
  const manageBtn = document.getElementById('manageSpinsBtn');
  if (manageBtn) manageBtn.textContent = `เติมสปิน / จัดการแพ็ก HEWKAO+ (เหลือ ${remaining} ครั้ง)`;
}

function injectBadge() {
  const spinBtn = document.getElementById('spinBtn');
  if (!spinBtn || document.getElementById('spinCountBadge')) return;
  const badge = document.createElement('span');
  badge.id = 'spinCountBadge';
  badge.className = 'spin-count-badge';
  badge.title = 'จำนวนครั้งสุ่มที่เหลือวันนี้ — กดเพื่อเติม';
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
        <div class="plan-price">฿${plan.price}<span class="plan-per">/เดือน</span></div>
        <div class="plan-spins">+${plan.spins.toLocaleString('en-US')} สุ่ม</div>
      </div>
      <button type="button" class="btn btn-primary plan-btn" data-plan="${plan.id}">เลือก</button>
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
      <h3 id="paywallTitle">เติมสปิน HEWKAO+</h3>
      <p class="modal-sub" id="paywallSub">เหลือ 0 ครั้งวันนี้</p>
      <div class="plan-list">${PLANS.map(planCardHTML).join('')}</div>
      <p class="paywall-note">โหมดทดลอง — ยังไม่เชื่อมระบบชำระเงินจริง กดเลือกแพ็กจะเติมสปินให้ทันทีเพื่อทดสอบ</p>
      <div class="modal-actions">
        <button id="paywallClose" type="button" class="btn btn-secondary btn-block">ปิด</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelector('#paywallClose').addEventListener('click', closePaywall);
  wrap.addEventListener('click', e => { if (e.target === wrap) closePaywall(); });
  wrap.querySelectorAll('.plan-btn').forEach(btn => {
    btn.addEventListener('click', () => simulatePurchase(btn.dataset.plan));
  });
}

export function openPaywall() {
  buildModal();
  document.getElementById('paywallSub').textContent =
    `วันนี้เหลือฟรี ${getFreeSpinsRemaining()} ครั้ง · มีเครดิตสะสม ${getPurchasedCredits()} ครั้ง`;
  document.getElementById('paywallModal').hidden = false;
}

function closePaywall() {
  const modal = document.getElementById('paywallModal');
  if (modal) modal.hidden = true;
}

function simulatePurchase(planId) {
  const plan = PLANS.find(p => p.id === planId);
  if (!plan) return;
  localStorage.setItem(CREDITS_KEY, String(getPurchasedCredits() + plan.spins));
  updateBadge();
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
  btn.textContent = `เติมสปิน / จัดการแพ็ก HEWKAO+ (เหลือ ${getTotalSpinsRemaining()} ครั้ง)`;
  btn.addEventListener('click', () => {
    document.getElementById('prefsModal').hidden = true;
    openPaywall();
  });
  modalActions.parentNode.insertBefore(btn, modalActions);
}

injectBadge();
injectPrefsLink();
