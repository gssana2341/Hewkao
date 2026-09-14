import { state } from './state.js';
import { GO_METHODS, catOf } from './constants.js';
import { escapeHTML, formatDistance, showToast, sleep } from './utils.js';
import { getPhotoUri } from './places-api.js';
import { isolateMarker, restoreAllMarkers, flyTo } from './map.js';
import { highlightCard, getVisibleRestaurants } from './restaurant-list.js';
import { openPrefs } from './preferences.js';
import { canSpin, consumeSpin, openPaywall } from './subscription.js';
import { maybeShow as maybeShowCheckin } from './checkin.js';
import { trackEvent } from './analytics.js';

const spinBtn = document.getElementById('spinBtn');
const spinOverlay = document.getElementById('spinOverlay');
const spinTrack = document.getElementById('spinTrack');
const resultBackdrop = document.getElementById('resultBackdrop');
const resultSheet = document.getElementById('resultSheet');
const resultScrollEl = resultSheet.querySelector('.result-scroll');
const resultCloseBtn = document.getElementById('resultCloseBtn');
const resultCuisineEl = document.getElementById('resultCuisine');
const resultNameEl = document.getElementById('resultName');
const resultPhotoWrapEl = document.getElementById('resultPhotoWrap');
const resultPhotoEl = document.getElementById('resultPhoto');
const resultPhotoCreditEl = document.getElementById('resultPhotoCredit');
const resultMetaEl = document.getElementById('resultMeta');
const resultAddressEl = document.getElementById('resultAddress');
const resultDistanceEl = document.getElementById('resultDistance');
const resultTelEl = document.getElementById('resultTel');
const resultMapsLinkEl = document.getElementById('resultMapsLink');
const resultMethodsEl = document.getElementById('resultMethods');
const respinBtn = document.getElementById('respinBtn');
const goBtn = document.getElementById('goBtn');

const RECENT_PICKS_TO_SKIP = 3;

// The random pool is exactly what the list and map show. It used to fall back
// to every restaurant when the filters matched nothing, which could land on a
// disliked category that had no pin on the map. Recently shown shops are
// skipped so "สุ่มใหม่" doesn't hand back the same one, as long as that still
// leaves something to pick from.
function getPool(visible) {
  const fresh = visible.filter(r => !state.recentPickIds.includes(r.id));
  return fresh.length ? fresh : visible;
}

function rememberPick(r, visibleCount) {
  const keep = Math.max(0, Math.min(RECENT_PICKS_TO_SKIP, visibleCount - 1));
  state.recentPickIds = [r.id, ...state.recentPickIds.filter(id => id !== r.id)].slice(0, keep);
}

function pickRandom(pool) { return pool[Math.floor(Math.random() * pool.length)]; }

// Compact one-line card used only inside the fast-spinning slot track — the
// slot animation's math is tuned to a fixed row height, so it stays simple.
// Always the category icon: a Places photo there would need a photographer
// credit nobody can read at 40px mid-spin, and would bill photos for filler
// shops the user never lands on.
function cardHTML(r) {
  const cat = catOf(r);
  const priceBit = r.priceLabel ? ` · ${r.priceLabel}` : '';
  return `<div class="card-emoji" style="--cat:${cat.color}">${cat.icon}</div>
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
  if (state.navigating) {
    showToast('กำลังเดินทางอยู่ กด "จบนำทาง" ก่อน ถึงจะสุ่มร้านใหม่ได้');
    return;
  }
  if (!state.restaurants.length) { showToast('ยังไม่พบร้านอาหารใกล้คุณ'); return; }
  const visible = getVisibleRestaurants();
  if (!visible.length) {
    showToast('ไม่มีร้านที่ตรงกับตัวกรอง ลองปรับการตั้งค่าดูนะ');
    openPrefs();
    return;
  }
  if (!canSpin()) { openPaywall(); return; }
  state.spinning = true;
  spinBtn.disabled = true;
  const finalPick = pickRandom(getPool(visible));
  await runSlotAnimation(visible, finalPick);
  state.spinning = false;
  spinBtn.disabled = false;
  consumeSpin();
  trackEvent('spin_performed', { category: finalPick.category });
  showResult(finalPick);
}

function deliverySearchUrl(methodId, r) {
  const platform = methodId === 'lineman' ? 'LINE MAN' : 'ShopeeFood';
  return `https://www.google.com/search?q=${encodeURIComponent(`${r.name} ${platform}`)}`;
}

// Opens turn-by-turn directions in Google Maps itself (the app on phones, a
// new tab on desktop). Free, no API key. In-app navigation (navigation.js)
// is the default for "เริ่มเดินทาง"; this is its fallback when that route
// computation fails, so a bad request never strands the user with no way
// to get directions at all.
export function directionsUrl(r) {
  const params = new URLSearchParams({ api: '1', destination: `${r.lat},${r.lng}`, destination_place_id: r.id });
  return `https://www.google.com/maps/dir/?${params}`;
}

function updateGoBtn() {
  goBtn.textContent = state.selectedMethod === 'self' ? 'เริ่มเดินทาง' : `สั่งผ่าน ${GO_METHODS.find(m => m.id === state.selectedMethod).label}`;
}

// Delivery options show for every result: Google's `delivery` flag is an
// Atmosphere-tier field, and asking for it would bill every search at that rate.
export function renderResultMethods(r) {
  resultMethodsEl.hidden = false;
  resultMethodsEl.innerHTML = GO_METHODS.map(m =>
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

// Google's Places photo policy requires crediting the photographer, linked to
// their Google Maps profile, whenever one of their photos is shown. The photo
// URI is shared with the list card, so a shop already seen there costs nothing
// more to show here.
function renderPhoto(r) {
  resultPhotoEl.removeAttribute('src');
  resultPhotoWrapEl.hidden = !r.photoName;
  if (!r.photoName) return;
  resultPhotoCreditEl.hidden = !r.photoAuthor;
  resultPhotoCreditEl.textContent = `รูปโดย ${r.photoAuthor}`;
  if (r.photoAuthorUrl) resultPhotoCreditEl.href = r.photoAuthorUrl;
  else resultPhotoCreditEl.removeAttribute('href');
  getPhotoUri(r).then(uri => {
    if (state.selected !== r) return;
    if (uri) resultPhotoEl.src = uri;
    else resultPhotoWrapEl.hidden = true;
  });
}

export function showResult(r) {
  state.selected = r;
  state.selectedMethod = 'self';
  rememberPick(r, getVisibleRestaurants().length);
  const cat = catOf(r);
  resultCuisineEl.textContent = cat.label;
  resultNameEl.textContent = r.name;
  renderPhoto(r);
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
  if (r.tel) {
    resultTelEl.textContent = `โทร ${r.tel}`;
    resultTelEl.href = `tel:${r.tel.replace(/[^0-9+]/g, '')}`;
    resultTelEl.hidden = false;
  } else {
    resultTelEl.hidden = true;
  }
  if (r.mapsUrl) {
    resultMapsLinkEl.href = r.mapsUrl;
    resultMapsLinkEl.hidden = false;
  } else {
    resultMapsLinkEl.hidden = true;
  }
  renderResultMethods(r);
  updateGoBtn();
  resultBackdrop.hidden = false;
  resultSheet.hidden = false;
  resultScrollEl.scrollTop = 0;
  resultSheet.style.animation = 'none';
  void resultSheet.offsetHeight;
  resultSheet.style.animation = '';
  isolateMarker(r);
  highlightCard(r.id);
  flyTo([r.lat, r.lng], 16);
}

// `offerCheckin` is set only when the user deliberately closes a result. That's
// when the once-a-day check-in popup gets its turn, instead of on app entry
// before a first-time visitor has even seen what the app does.
export function hideResult({ offerCheckin = false } = {}) {
  if (resultSheet.hidden) return;
  resultSheet.hidden = true;
  resultBackdrop.hidden = true;
  restoreAllMarkers();
  if (offerCheckin) setTimeout(maybeShowCheckin, 350);
}

const closeResult = () => hideResult({ offerCheckin: true });

spinBtn.addEventListener('click', spin);
resultBackdrop.addEventListener('click', closeResult);
resultCloseBtn.addEventListener('click', closeResult);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeResult(); });
respinBtn.addEventListener('click', () => { hideResult(); spin(); });

goBtn.addEventListener('click', async () => {
  const r = state.selected;
  if (!r) return;
  trackEvent('go_clicked', { method: state.selectedMethod, category: r.category });
  if (state.selectedMethod === 'self') {
    // Dynamic: this is what keeps MapLibre GL JS out of everyone's initial
    // download (see the comment in main.js) — loaded on first use, then
    // cached by the browser for the rest of the visit.
    const { startNavigation } = await import('./navigation.js');
    startNavigation(r);
  } else {
    const url = deliverySearchUrl(state.selectedMethod, r);
    window.open(url, '_blank', 'noopener');
  }
});
