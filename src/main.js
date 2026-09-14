import './js/maps-loader.js';
import './js/analytics.js';

// Each of these modules grabs its own DOM refs and self-registers its own
// event listeners as a side effect of being imported (same pattern as
// subscription.js's injectBadge()/injectPrefsLink() already used) — importing
// them here is what wires up the whole app, not a series of explicit calls.
import './js/subscription.js';
import './js/auth.js';
import './js/profile.js';
import './js/checkin.js';
import './js/preferences.js';
import './js/map.js';
import './js/navigation.js';
import './js/restaurant-list.js';
import './js/spin-result.js';

import { state } from './js/state.js';
import { initMap } from './js/map.js';
import { loadNearby } from './js/restaurant-list.js';
import { maybeShow as maybeShowCheckin } from './js/checkin.js';
import { trackEvent } from './js/analytics.js';

const splash = document.getElementById('splash');
const splashSub = document.getElementById('splashSub');
const splashRetryBtn = document.getElementById('splashRetryBtn');
const appEl = document.getElementById('app');

/* ---------- Geolocation ---------- */
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); resolve(pos); },
      err => { clearTimeout(timer); reject(err); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

/* ---------- Init ---------- */
// Location is required, not optional — HEWKAO's whole premise is "restaurants
// near you", so silently substituting a hardcoded Bangkok point on failure
// just produced confusing, wrong results. Block on the splash screen instead
// and let the user retry until we actually get a real fix.
async function enterApp() {
  splash.classList.add('fade-out');
  setTimeout(() => { splash.hidden = true; }, 500);
  appEl.hidden = false;
  await initMap();
  loadNearby();
  setTimeout(() => maybeShowCheckin(), 600);
}

// GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE,
// 3=TIMEOUT. Our own race-against-timeout in getPosition() throws a plain
// Error('timeout') with no .code, so that's checked by message instead.
function explainLocationError(err) {
  if (!navigator.geolocation) return 'เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง ลองเปิดด้วยเบราว์เซอร์อื่น';
  if (err?.code === 1) return 'HEWKAO ต้องใช้ตำแหน่งของคุณเพื่อหาร้านใกล้ๆ กรุณาอนุญาตสิทธิ์ตำแหน่งที่ตั้งในเบราว์เซอร์ แล้วลองอีกครั้ง';
  if (err?.code === 2) return 'หาตำแหน่งของคุณไม่ได้ ลองเปิด Location Services ของเครื่องแล้วลองอีกครั้ง';
  if (err?.code === 3 || err?.message === 'timeout') return 'หาตำแหน่งนานเกินไป ลองอีกครั้ง';
  return 'ไม่พบตำแหน่งของคุณ ลองอีกครั้ง';
}

async function tryGetLocation() {
  splashRetryBtn.hidden = true;
  splashSub.textContent = 'กำลังค้นหาตำแหน่งของคุณ…';
  try {
    const pos = await getPosition();
    state.userLatLng = [pos.coords.latitude, pos.coords.longitude];
    trackEvent('location_granted');
    await enterApp();
  } catch (err) {
    console.warn('[HEWKAO] geolocation failed:', err);
    splashSub.textContent = explainLocationError(err);
    splashRetryBtn.hidden = false;
    trackEvent('location_denied', { reason: err?.code ? `code_${err.code}` : (err?.message || 'unknown') });
  }
}
splashRetryBtn.addEventListener('click', tryGetLocation);

tryGetLocation();
