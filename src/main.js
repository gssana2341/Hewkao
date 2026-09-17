import './js/maps-loader.js';
import './js/analytics.js';

// Each of these modules grabs its own DOM refs and self-registers its own
// event listeners as a side effect of being imported (same pattern as
// subscription.js's injectBadge()/injectPrefsLink() already used) — importing
// them here is what wires up the whole app, not a series of explicit calls.
import './js/subscription.js';
import './js/auth.js';
import './js/profile.js';
import './js/feedback.js';
import './js/admin-feedback.js';
import './js/checkin.js';
import './js/preferences.js';
import './js/map.js';
import './js/restaurant-list.js';
import './js/spin-result.js';
// navigation.js is NOT imported here — it pulls in MapLibre GL JS (~300 KB
// gzipped), so spin-result.js loads it dynamically only once someone
// actually taps "เริ่มเดินทาง", instead of everyone paying for it upfront.

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
  if (!navigator.geolocation) return 'เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง';
  if (err?.code === 1) return 'คุณปฏิเสธการให้สิทธิ์ตำแหน่ง';
  if (err?.code === 2) return 'หาตำแหน่งของคุณไม่ได้ ลองเปิด Location Services ของเครื่อง';
  if (err?.code === 3) return 'หาตำแหน่งนานเกินไป กรุณาลองอีกครั้ง';
  return 'ไม่พบตำแหน่งของคุณ กรุณาลองอีกครั้ง';
}

async function tryGetLocation() {
  if (locating || entered) return;
  locating = true;
  splash.hidden = false;
  splashRetryBtn.hidden = true;
  landing.hidden = true; // ensure landing is hidden, strict block
  
  const hintEl = document.getElementById('splashHint');
  if (hintEl) {
    hintEl.textContent = 'เพื่อหาร้านอาหารที่ใกล้คุณที่สุด โปรดกด "อนุญาต" (Allow) ที่หน้าต่างแจ้งเตือนของเบราว์เซอร์';
    hintEl.style.color = 'var(--color-text)';
    hintEl.hidden = false;
  }
  
  splashSub.textContent = 'กำลังขอเข้าถึงตำแหน่งของคุณ…';
  // Some browsers never call back at all when the prompt is dismissed, so
  // offer a retry after a while — without abandoning the request in flight.
  const slowHint = setTimeout(() => {
    locating = false;
    showSplashError('ยังหาตำแหน่งไม่เจอ ถ้าไม่มีหน้าต่างขออนุญาตขึ้นมา ลองรีเฟรชหน้าเว็บ หรือกดลองอีกครั้ง');
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
    splashSub.textContent = explainLocationError(err);
    if (hintEl) {
      hintEl.textContent = 'แอปนี้จำเป็นต้องใช้ตำแหน่งปัจจุบันของคุณ หากไม่เปิดสิทธิ์ จะไม่สามารถใช้งานเว็บไซต์ได้เลย โปรดไปที่การตั้งค่าเบราว์เซอร์เพื่ออนุญาตสิทธิ์ตำแหน่ง แล้วกดลองอีกครั้ง';
      hintEl.style.color = 'var(--color-accent-dark)';
    }
    splashRetryBtn.hidden = false;
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
    // Already have a map/location fix from earlier — hop back into it
    // instead of asking for location and reloading the map all over again.
    if (entered) {
      landing.hidden = true;
      appEl.hidden = false;
      return;
    }
    tryGetLocation();
  });
});

// The logo used to be a plain `<a href="/">`, which just reloaded the whole
// page — since location is cached, that silently re-entered the same map
// view instead of taking anyone anywhere. Once the app has been entered,
// clicking it shows the landing page in place instead.
const brandChip = document.querySelector('.brand-chip');
brandChip.addEventListener('click', (e) => {
  if (!entered) return; // already on splash/landing, let the link behave normally
  e.preventDefault();
  trackEvent('logo_clicked');
  appEl.hidden = true;
  landingNotice.hidden = true;
  landing.hidden = false;
  landing.scrollTop = 0;
});

tryGetLocation();
