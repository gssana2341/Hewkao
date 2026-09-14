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
const splash = document.getElementById('splash');
const splashSub = document.getElementById('splashSub');
const splashRetryBtn = document.getElementById('splashRetryBtn');
const appEl = document.getElementById('app');

const SLOW_LOCATION_HINT_MS = 15000;
// Set once a location fix succeeds so the next visit can skip the landing page.
// The inline script in index.html reads this same key before first paint.
const LOCATION_OK_KEY = 'hewkao_location_ok';

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
// Location is required, not optional — HEWKAO's whole premise is "restaurants
// near you", so silently substituting a hardcoded Bangkok point on failure
// just produced confusing, wrong results. Block on the splash screen instead
// and let the user retry until we actually get a real fix.
let entered = false;
let locating = false;

// Every failure also offers the random menu page, which needs no location —
// so a visitor who won't share it still leaves with something to eat.
function showSplashError(message) {
  splashSub.textContent = message;
  splashRetryBtn.hidden = false;
  document.getElementById('splashMenuLink').hidden = false;
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
  splash.classList.add('fade-out');
  setTimeout(() => { splash.hidden = true; }, 500);
  loadNearby();
}

// GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE,
// 3=TIMEOUT.
function explainLocationError(err) {
  if (!navigator.geolocation) return 'เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง ลองเปิดด้วยเบราว์เซอร์อื่น';
  if (err?.code === 1) return 'HEWKAO ต้องใช้ตำแหน่งของคุณเพื่อหาร้านใกล้ๆ กรุณาอนุญาตสิทธิ์ตำแหน่งที่ตั้งในเบราว์เซอร์ แล้วลองอีกครั้ง';
  if (err?.code === 2) return 'หาตำแหน่งของคุณไม่ได้ ลองเปิด Location Services ของเครื่องแล้วลองอีกครั้ง';
  if (err?.code === 3) return 'หาตำแหน่งนานเกินไป ลองอีกครั้ง';
  return 'ไม่พบตำแหน่งของคุณ ลองอีกครั้ง';
}

async function tryGetLocation() {
  if (locating || entered) return;
  locating = true;
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
    localStorage.setItem(LOCATION_OK_KEY, '1');
    trackEvent('location_granted');
    await enterApp();
  } catch (err) {
    if (entered) return;
    console.warn('[HEWKAO] geolocation failed:', err);
    if (err?.code === 1) localStorage.removeItem(LOCATION_OK_KEY);
    showSplashError(explainLocationError(err));
    trackEvent('location_denied', { reason: err?.code ? `code_${err.code}` : (err?.message || 'unknown') });
  } finally {
    clearTimeout(slowHint);
    locating = false;
  }
}
splashRetryBtn.addEventListener('click', tryGetLocation);

// Location is only ever requested from a tap on a start button (or for a
// returning visitor who already allowed it) — never on page load. That keeps
// the landing content readable for first-time visitors and search engines,
// and browsers treat unprompted location requests as spammy.
function startApp() {
  document.documentElement.classList.remove('returning');
  landing.hidden = true;
  splash.hidden = false;
  tryGetLocation();
}

document.querySelectorAll('[data-start]').forEach(btn => {
  btn.addEventListener('click', () => {
    trackEvent('start_clicked');
    startApp();
  });
});

// The returning flag only says location worked last time; the permission may
// have been revoked since. Auto-start only while the browser still reports it
// as granted, otherwise fall back to the landing page.
async function boot() {
  if (!document.documentElement.classList.contains('returning')) return;
  let granted = false;
  try {
    granted = (await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted';
  } catch {
    // Permissions API unsupported for geolocation: treat as not granted.
  }
  if (granted) {
    startApp();
  } else {
    document.documentElement.classList.remove('returning');
    localStorage.removeItem(LOCATION_OK_KEY);
  }
}

boot();
