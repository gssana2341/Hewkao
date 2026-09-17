import { showToast } from './utils.js';
import { addCredits } from './subscription.js';
import { getCache, patch, subscribe } from './user-data.js';

/* =========================================================================
   HEWKAO — daily check-in streak.

   Grants +1 spin credit (through subscription.js's addCredits(), the same
   pool consumeSpin() already spends from, so it composes for free with the
   existing free-then-credits spend order) for returning each day. Missing
   a day resets the streak to day 1; consecutive days advance it, looping
   back to day 1 after day 7. Streak/claim state lives in the Firestore user
   doc (user-data.js) so it survives across devices once logged in.
   ========================================================================= */

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
  const lastClaim = getCache().lastClaimDate;
  const streak = getCache().checkinStreak || 0;
  if (lastClaim === todayKey()) return streak; // already claimed today
  if (lastClaim === yesterdayKey()) return streak >= CYCLE_LENGTH ? 1 : streak + 1; // consecutive day
  return 1; // gap or first visit
}

export function hasClaimedToday() {
  return getCache().lastClaimDate === todayKey();
}

export function getStreak() {
  return getCache().checkinStreak || 0;
}

// Red dot on the profile button while today's reward is unclaimed — a quiet
// reminder, now that the popup no longer opens by itself on app entry.
function refreshProfileDot() {
  document.getElementById('profileBtn')?.classList.toggle('has-dot', !hasClaimedToday());
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

// Shared with profile.js, which shows this same strip inline on the profile
// page instead of making "what's my streak" wait behind opening this modal.
export function renderStripHTML() {
  const pendingDay = pendingStreakDay();
  const claimedAlready = hasClaimedToday();
  let strip = '';
  for (let day = 1; day <= CYCLE_LENGTH; day++) strip += pipHTML(day, pendingDay, claimedAlready);
  return strip;
}

function rewardText() {
  const pendingDay = pendingStreakDay();
  return hasClaimedToday()
    ? `รับไปแล้ววันนี้ (Day ${pendingDay}/${CYCLE_LENGTH})`
    : `วันนี้ได้รับ +${DAILY_CREDIT} สปิน (Day ${pendingDay}/${CYCLE_LENGTH})`;
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
  document.getElementById('checkinStrip').innerHTML = renderStripHTML();
  document.getElementById('checkinReward').textContent = rewardText();
  const claimBtn = document.getElementById('checkinClaimBtn');
  const claimedAlready = hasClaimedToday();
  claimBtn.disabled = claimedAlready;
  claimBtn.textContent = claimedAlready ? 'รับแล้ววันนี้' : 'รับรางวัล';
}

// Exported so the profile page's own claim button can grant the reward
// without opening this modal at all — same effect either way.
export function claim() {
  if (hasClaimedToday()) return;
  const day = pendingStreakDay();
  patch({ checkinStreak: day, lastClaimDate: todayKey() });
  addCredits(DAILY_CREDIT);
  refreshProfileDot();
  // Guard on existence, not just !hidden: a null modal (never opened this
  // visit, e.g. claimed straight from the profile page) has hidden===undefined,
  // and !undefined is true — that false positive was calling renderModal()
  // against #checkinStrip before buildModal() had ever created it.
  const modal = document.getElementById('checkinModal');
  if (modal && !modal.hidden) renderModal();
  showToast(`รับสำเร็จ! +${DAILY_CREDIT} สปิน (Day ${day}/${CYCLE_LENGTH})`);
  if (modal && !modal.hidden) setTimeout(close, 900);
}

// Always opens — for explicit buttons (profile, paywall). The automatic,
// once-a-day path is maybeShow() below.
export function open() {
  patch({ lastSeenDate: todayKey() });
  buildModal();
  renderModal();
  document.getElementById('checkinModal').hidden = false;
}

function close() {
  const modal = document.getElementById('checkinModal');
  if (modal) modal.hidden = true;
}

// Shows the popup at most once per calendar day, regardless of claiming —
// dismissing without claiming must not bring it back later that day.
export function maybeShow() {
  if (getCache().lastSeenDate === todayKey()) return;
  open();
}

refreshProfileDot();
subscribe(() => {
  refreshProfileDot();
  const modal = document.getElementById('checkinModal');
  if (modal && !modal.hidden) renderModal();
});
