import { state } from './state.js';
import { GO_METHODS, catOf } from './constants.js';
import { escapeHTML, formatDistance, showToast, sleep } from './utils.js';
import { getDislikedSet, getOpenNowOnly } from './preferences.js';
import { isolateMarker, restoreAllMarkers, flyTo } from './map.js';
import { highlightCard } from './restaurant-list.js';
import { startNavigation, clearRoute } from './navigation.js';
import { canSpin, consumeSpin, openPaywall } from './subscription.js';
import { trackEvent } from './analytics.js';

const spinBtn = document.getElementById('spinBtn');
const spinOverlay = document.getElementById('spinOverlay');
const spinTrack = document.getElementById('spinTrack');
const resultBackdrop = document.getElementById('resultBackdrop');
const resultSheet = document.getElementById('resultSheet');
const resultCuisineEl = document.getElementById('resultCuisine');
const resultNameEl = document.getElementById('resultName');
const resultPhotoEl = document.getElementById('resultPhoto');
const resultMetaEl = document.getElementById('resultMeta');
const resultAddressEl = document.getElementById('resultAddress');
const resultDistanceEl = document.getElementById('resultDistance');
const resultTelEl = document.getElementById('resultTel');
const resultMethodsEl = document.getElementById('resultMethods');
const respinBtn = document.getElementById('respinBtn');
const goBtn = document.getElementById('goBtn');
const resultReviewsEl = document.getElementById('resultReviews');

function getPool() {
  const disliked = getDislikedSet();
  let pool = state.restaurants.filter(r => !disliked.has(r.category));
  if (getOpenNowOnly()) {
    const openPool = pool.filter(r => r.openNow !== false);
    if (openPool.length) pool = openPool;
  }
  return pool.length ? pool : state.restaurants;
}
function pickRandom(pool) { return pool[Math.floor(Math.random() * pool.length)]; }

// Compact one-line card used only inside the fast-spinning slot track — the
// slot animation's math is tuned to a fixed row height, so it stays simple.
function cardHTML(r) {
  const cat = catOf(r);
  const thumb = r.thumbUrl
    ? `<img class="card-photo" src="${r.thumbUrl}" alt="" loading="lazy">`
    : `<div class="card-emoji" style="color:${cat.color}">${cat.icon}</div>`;
  const priceBit = r.priceLabel ? ` · ${r.priceLabel}` : '';
  return `${thumb}
    <div class="card-body">
      <div class="card-name">${escapeHTML(r.name)}</div>
      <div class="card-meta">${cat.label} · ${formatDistance(r.distance)}${priceBit}</div>
    </div>`;
}

// Animates the track to `px` over `durationSec`, resolving on transitionend (with a
// watchdog fallback in case the event never fires).
function animateTrackTo(px, durationSec, easing) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      spinTrack.removeEventListener('transitionend', finish);
      resolve();
    };
    // Double rAF: without it, some browsers collapse the "none" -> animated transition
    // change into one frame and the transform jumps instantly with no visible motion.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        spinTrack.style.transition = `transform ${durationSec}s ${easing}`;
        spinTrack.style.transform = `translateY(${px}px)`;
      });
    });
    spinTrack.addEventListener('transitionend', finish);
    setTimeout(finish, durationSec * 1000 + 400);
  });
}

async function runSlotAnimation(pool, finalPick) {
  const cardH = 76;

  // The spin is the core interaction of this app (not decorative chrome), so it
  // always plays in full — prefers-reduced-motion only trims the smaller effects
  // (splash icon, button pulse, sheet bounce), not this one.

  // Two phases for a real slot-machine feel: a fast constant-speed spin first,
  // then a gradual deceleration that lands exactly on the pick.
  const FAST_COUNT = 16;
  const SLOW_COUNT = 10;
  const N = FAST_COUNT + SLOW_COUNT;
  const items = [];
  for (let i = 0; i < N - 1; i++) items.push(pickRandom(pool));
  items.push(finalPick);
  spinTrack.innerHTML = items.map(r => `<div class="spin-card">${cardHTML(r)}</div>`).join('');
  spinOverlay.hidden = false;

  spinTrack.style.transition = 'none';
  spinTrack.style.transform = 'translateY(0)';
  void spinTrack.offsetHeight;

  const fastY = -(FAST_COUNT * cardH);
  const finalY = 72 - (N - 1) * cardH;

  await animateTrackTo(fastY, 1.1, 'linear');
  await animateTrackTo(finalY, 1.9, 'cubic-bezier(0.15,0.65,0.25,1)');
  await sleep(250);
  spinOverlay.hidden = true;
}

export async function spin() {
  if (state.spinning) return;
  if (!canSpin()) { openPaywall(); return; }
  const pool = getPool();
  if (!pool.length) { showToast('ยังไม่พบร้านอาหารใกล้คุณ'); return; }
  state.spinning = true;
  spinBtn.disabled = true;
  const finalPick = pickRandom(pool);
  await runSlotAnimation(pool, finalPick);
  state.spinning = false;
  spinBtn.disabled = false;
  consumeSpin();
  trackEvent('spin_performed', { category: finalPick.category });
  showResult(finalPick);
}

function availableGoMethods(r) {
  return GO_METHODS.filter(m => m.id === 'self' || r.delivery);
}

function deliverySearchUrl(methodId, r) {
  const platform = methodId === 'lineman' ? 'LINE MAN' : 'ShopeeFood';
  return `https://www.google.com/search?q=${encodeURIComponent(`${r.name} ${platform}`)}`;
}

function updateGoBtn() {
  goBtn.textContent = state.selectedMethod === 'self' ? 'เริ่มเดินทาง' : `สั่งผ่าน ${GO_METHODS.find(m => m.id === state.selectedMethod).label}`;
}

export function renderResultMethods(r) {
  const methods = availableGoMethods(r);
  if (methods.length <= 1) {
    resultMethodsEl.hidden = true;
    resultMethodsEl.innerHTML = '';
    return;
  }
  resultMethodsEl.hidden = false;
  resultMethodsEl.innerHTML = methods.map(m =>
    `<button type="button" class="chip ${state.selectedMethod === m.id ? 'selected' : ''}" data-method="${m.id}"><img class="chip-icon" src="${m.icon}" alt="">${m.label}</button>`
  ).join('');
  resultMethodsEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.selectedMethod = chip.dataset.method;
      renderResultMethods(r);
      updateGoBtn();
    });
  });
}

export function showResult(r) {
  state.selected = r;
  state.selectedMethod = 'self';
  clearRoute();
  const cat = catOf(r);
  resultCuisineEl.textContent = cat.label;
  resultNameEl.textContent = r.name;
  if (r.photoUrl) {
    resultPhotoEl.src = r.photoUrl;
    resultPhotoEl.hidden = false;
  } else {
    resultPhotoEl.hidden = true;
    resultPhotoEl.removeAttribute('src');
  }
  const metaBits = [];
  if (r.rating) metaBits.push(`★ ${r.rating.toFixed(1)}${r.ratingCount ? ` (${r.ratingCount})` : ''}`);
  if (r.priceLabel) metaBits.push(r.priceLabel);
  // Same open/closed color coding as the restaurant list cards (green/gray)
  // instead of blending into the same accent color as the rating and price.
  if (r.openNow === true) metaBits.push('<span class="card-status-open">เปิดอยู่</span>');
  else if (r.openNow === false) metaBits.push('<span class="card-status-closed">ปิดแล้ว</span>');
  if (metaBits.length) {
    resultMetaEl.innerHTML = metaBits.join(' · ');
    resultMetaEl.hidden = false;
  } else {
    resultMetaEl.hidden = true;
  }
  if (r.address) {
    resultAddressEl.textContent = r.address;
    resultAddressEl.hidden = false;
  } else {
    resultAddressEl.hidden = true;
  }
  resultDistanceEl.textContent = `ห่างออกไป ${formatDistance(r.distance)}`;
  renderResultMethods(r);
  updateGoBtn();
  if (r.tel) {
    resultTelEl.textContent = `โทร ${r.tel}`;
    resultTelEl.href = `tel:${r.tel.replace(/[^0-9+]/g, '')}`;
    resultTelEl.hidden = false;
  } else {
    resultTelEl.hidden = true;
  }
  if (r.reviews && r.reviews.length) {
    resultReviewsEl.innerHTML = r.reviews.map(rv => `
      <div class="review-item">
        <div class="review-head">
          <span class="review-author">${escapeHTML(rv.author)}</span>
          <span class="review-stars">${'★'.repeat(Math.round(rv.rating))}${'☆'.repeat(5 - Math.round(rv.rating))}</span>
        </div>
        <p class="review-text">${escapeHTML(rv.text)}</p>
      </div>
    `).join('');
    resultReviewsEl.hidden = false;
  } else {
    resultReviewsEl.innerHTML = '';
    resultReviewsEl.hidden = true;
  }
  resultBackdrop.hidden = false;
  resultSheet.hidden = false;
  resultSheet.style.animation = 'none';
  void resultSheet.offsetHeight;
  resultSheet.style.animation = '';
  isolateMarker(r);
  highlightCard(r.id);
  flyTo([r.lat, r.lng], 16);
}

export function hideResult() {
  resultSheet.hidden = true;
  resultBackdrop.hidden = true;
  if (!state.navigating) restoreAllMarkers();
}

spinBtn.addEventListener('click', spin);
resultBackdrop.addEventListener('click', hideResult);
respinBtn.addEventListener('click', () => { hideResult(); spin(); });
goBtn.addEventListener('click', () => {
  if (!state.selected) return;
  trackEvent('go_clicked', { method: state.selectedMethod, category: state.selected.category });
  if (state.selectedMethod === 'self') {
    startNavigation(state.selected);
  } else {
    window.open(deliverySearchUrl(state.selectedMethod, state.selected), '_blank', 'noopener');
  }
});
