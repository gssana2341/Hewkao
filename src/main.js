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
import './js/restaurant-list.js';
import './js/spin-result.js';

import { state } from './js/state.js';
import { initMap } from './js/map.js';
import { loadNearby } from './js/restaurant-list.js';
import { trackEvent } from './js/analytics.js';

const landing = document.getElementById('landing');
const landingNotice = document.getElementById('landingNotice');
const splash = document.getElementById('splash');
const splashSub = document.getElementById('splashSub');
const splashRetryBtn = document.getElementById('splashRetryBtn');
const appEl = document.getElementById('app');

const SLOW_LOCATION_HINT_MS = 15000;

/* ---------- Geolocation ---------- */
// No hand-rolled race timer here: the API's own `timeout` only starts counting
// once the user has answered the permission prompt. A setTimeout started up
// front used to reject anyone who took more than 8s to read that prompt.
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

/* ---------- Init ---------- */
// HEWKAO opens straight into the map: the splash asks for location on load and
// the app appears as soon as there's a fix, keeping the way to the first spin
// as short as possible. Location is required — silently substituting a
// hardcoded point just produced wrong results — so when it can't be had
// (denied, unavailable, unsupported) the landing page under the splash is
// revealed instead: an explanation and a retry rather than a dead end, and
// the content search engines index.
let entered = false;
let locating = false;

function showSplashError(message) {
  splashSub.textContent = message;
  splashRetryBtn.hidden = false;
}

function showLandingFallback(message) {
  landingNotice.textContent = message;
  landingNotice.hidden = false;
  landing.scrollTop = 0;
  splash.hidden = true;
}

// The map loads underneath the still-opaque splash, which only fades once the
// map is ready. Hiding the splash first meant a failed map load (bad key,
// billing off, offline) left a blank grey screen, with the error message
// written onto the splash that had already been hidden.
async function enterApp() {
  entered = true;
  splashSub.textContent = 'กำลังโหลดแผนที่…';
  appEl.hidden = false;
  try {
    await initMap();
  } catch (err) {
    console.error('[HEWKAO] map failed to load:', err);
    entered = false;
    appEl.hidden = true;
    showSplashError('โหลดแผนที่ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
    trackEvent('maps_load_failed', { reason: String(err?.message || err).slice(0, 100) });
    return;
  }
  landing.hidden = true;
  splash.classList.add('fade-out');
  setTimeout(() => { splash.hidden = true; }, 500);
  loadNearby();
}

// GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE,
// 3=TIMEOUT.
function explainLocationError(err) {
  if (!navigator.geolocation) return 'เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง ลองเปิดด้วยเบราว์เซอร์อื่น หรือสุ่มเมนูอาหารแทนก่อนก็ได้';
  if (err?.code === 1) return 'HEWKAO ต้องใช้ตำแหน่งของคุณเพื่อหาร้านใกล้ๆ กรุณาอนุญาตสิทธิ์ตำแหน่งในเบราว์เซอร์ แล้วกด "สุ่มร้านใกล้ฉัน" อีกครั้ง';
  if (err?.code === 2) return 'หาตำแหน่งของคุณไม่ได้ ลองเปิด Location Services ของเครื่อง แล้วกด "สุ่มร้านใกล้ฉัน" อีกครั้ง';
  if (err?.code === 3) return 'หาตำแหน่งนานเกินไป กด "สุ่มร้านใกล้ฉัน" เพื่อลองอีกครั้ง';
  return 'ไม่พบตำแหน่งของคุณ กด "สุ่มร้านใกล้ฉัน" เพื่อลองอีกครั้ง';
}

async function tryGetLocation() {
  if (locating || entered) return;
  locating = true;
  splash.hidden = false;
  splashRetryBtn.hidden = true;
  splashSub.textContent = 'กำลังค้นหาตำแหน่งของคุณ…';
  // Some browsers never call back at all when the prompt is dismissed, so
  // offer a retry after a while — without abandoning the request in flight.
  const slowHint = setTimeout(() => {
    locating = false;
    showSplashError('ยังหาตำแหน่งไม่เจอ ถ้าไม่มีหน้าต่างขออนุญาตขึ้นมา ลองกดอีกครั้ง');
  }, SLOW_LOCATION_HINT_MS);
  try {
    const pos = await getPosition();
    if (entered) return;
    state.userLatLng = [pos.coords.latitude, pos.coords.longitude];
    trackEvent('location_granted');
    await enterApp();
  } catch (err) {
    if (entered) return;
    console.warn('[HEWKAO] geolocation failed:', err);
    showLandingFallback(explainLocationError(err));
    trackEvent('location_denied', { reason: err?.code ? `code_${err.code}` : (err?.message || 'unknown') });
  } finally {
    clearTimeout(slowHint);
    locating = false;
  }
}

splashRetryBtn.addEventListener('click', tryGetLocation);
document.querySelectorAll('[data-start]').forEach(btn => {
  btn.addEventListener('click', () => {
    trackEvent('start_clicked');
    tryGetLocation();
  });
});

tryGetLocation();
