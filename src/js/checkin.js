import { showToast } from './utils.js';
import { updateBadge } from './subscription.js';

/* =========================================================================
   HEWKAO — daily check-in streak.

   Grants +1 spin credit (added to the same hewkao_spin_credits pool
   subscription.js already spends from, so it composes for free with the
   existing free-then-credits spend order) for returning each day. Missing
   a day resets the streak to day 1; consecutive days advance it, looping
   back to day 1 after day 7.
   ========================================================================= */

const STREAK_KEY = 'hewkao_checkin_streak';
const LAST_CLAIM_KEY = 'hewkao_checkin_last_claim_date';
const LAST_SEEN_KEY = 'hewkao_checkin_last_seen_date';
const SPIN_CREDITS_KEY = 'hewkao_spin_credits'; // owned by subscription.js — read/write via this same key so consumeSpin() picks it up automatically
const CYCLE_LENGTH = 7;
const DAILY_CREDIT = 1;

function todayKey() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

function pendingStreakDay() {
  const lastClaim = localStorage.getItem(LAST_CLAIM_KEY);
  const streak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
  if (lastClaim === todayKey()) return streak; // already claimed today
  if (lastClaim === yesterdayKey()) return streak >= CYCLE_LENGTH ? 1 : streak + 1; // consecutive day
  return 1; // gap or first visit
}

export function hasClaimedToday() {
  return localStorage.getItem(LAST_CLAIM_KEY) === todayKey();
}

export function getStreak() {
  return parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
}

/* ---------- Modal (built once, on demand) ---------- */
function pipHTML(day, pendingDay, claimedAlready) {
  let state;
  if (day < pendingDay) state = 'done';
  else if (day === pendingDay) state = claimedAlready ? 'done' : 'today';
  else state = 'upcoming';
  return `
    <div class="checkin-pip ${state}">
      <span class="checkin-pip-day">Day ${day}</span>
      <span class="checkin-pip-reward">+${DAILY_CREDIT}</span>
    </div>`;
}

function buildModal() {
  if (document.getElementById('checkinModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'checkinModal';
  wrap.className = 'modal-backdrop';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal checkin-modal" role="dialog" aria-modal="true" aria-labelledby="checkinTitle">
      <h3 id="checkinTitle">เช็คอินรายวัน</h3>
      <p class="modal-sub">แวะมาทุกวันเพื่อรับสปินฟรีสะสม</p>
      <div id="checkinStrip" class="checkin-strip"></div>
      <p id="checkinReward" class="checkin-reward-callout"></p>
      <button id="checkinClaimBtn" type="button" class="btn btn-primary btn-block">รับรางวัล</button>
    </div>`;
  document.body.appendChild(wrap);

  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('#checkinClaimBtn').addEventListener('click', claim);
}

function renderModal() {
  const pendingDay = pendingStreakDay();
  const claimedAlready = hasClaimedToday();
  let strip = '';
  for (let day = 1; day <= CYCLE_LENGTH; day++) strip += pipHTML(day, pendingDay, claimedAlready);
  document.getElementById('checkinStrip').innerHTML = strip;
  document.getElementById('checkinReward').textContent = claimedAlready
    ? `รับไปแล้ววันนี้ (Day ${pendingDay}/${CYCLE_LENGTH})`
    : `วันนี้ได้รับ +${DAILY_CREDIT} สปิน (Day ${pendingDay}/${CYCLE_LENGTH})`;
  const claimBtn = document.getElementById('checkinClaimBtn');
  claimBtn.disabled = claimedAlready;
  claimBtn.textContent = claimedAlready ? 'รับแล้ววันนี้' : 'รับรางวัล';
}

function claim() {
  if (hasClaimedToday()) return;
  const day = pendingStreakDay();
  localStorage.setItem(STREAK_KEY, String(day));
  localStorage.setItem(LAST_CLAIM_KEY, todayKey());
  const credits = parseInt(localStorage.getItem(SPIN_CREDITS_KEY) || '0', 10);
  localStorage.setItem(SPIN_CREDITS_KEY, String(credits + DAILY_CREDIT));
  updateBadge();
  renderModal();
  showToast(`รับสำเร็จ! +${DAILY_CREDIT} สปิน (Day ${day}/${CYCLE_LENGTH})`);
  setTimeout(close, 900);
}

function open() {
  buildModal();
  renderModal();
  document.getElementById('checkinModal').hidden = false;
}

function close() {
  const modal = document.getElementById('checkinModal');
  if (modal) modal.hidden = true;
}

// Shows the popup at most once per calendar day, regardless of claiming —
// dismissing without claiming must not bring it back on the next reload.
export function maybeShow() {
  if (localStorage.getItem(LAST_SEEN_KEY) === todayKey()) return;
  localStorage.setItem(LAST_SEEN_KEY, todayKey());
  open();
}
