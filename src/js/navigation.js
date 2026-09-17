// Navigation lifecycle (start → track → arrive/stop), GPS tracking, off-route
// detection and re-routing. This module owns the data; nav-map.js owns the
// map visuals, computeRoute() (routes-api.js) owns fetching directions.

import { state } from './state.js';
import { formatDistance, formatDuration, haversine, showToast } from './utils.js';
import { computeRoute } from './routes-api.js';
import { trackEvent } from './analytics.js';
import { hideResult, directionsUrl } from './spin-result.js';
import { restoreAllMarkers } from './map.js';
import {
  initNavMap, destroyNavMap, drawRoute, updateUserPosition,
  updateInstruction, updateEta, showArrived, hideNavOverlay, showNavOverlay,
} from './nav-map.js';

const OFF_ROUTE_THRESHOLD_M = 50;   // metres from route before re-routing
const REROUTE_COOLDOWN_MS = 5000;   // don't re-route more than once per 5s
const ARRIVAL_THRESHOLD_M = 30;     // close enough = arrived
const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 };

const appEl = document.getElementById('app');
const miniNavBar = document.getElementById('miniNavBar');
const miniNavEta = document.getElementById('miniNavEta');
const miniNavDest = document.getElementById('miniNavDest');
const miniNavEndBtn = document.getElementById('miniNavEndBtn');
const navMinimizeBtn = document.getElementById('navMinimizeBtn');

// ---------------------------------------------------------------------------
// Geometry helpers — all work on [lat,lng] pairs (computeRoute()'s format)
// ---------------------------------------------------------------------------

/** Minimum distance (metres) from a point to any segment of the route line. */
function distanceToLine(lat, lng, coords) {
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [aLat, aLng] = coords[i];
    const [bLat, bLng] = coords[i + 1];
    const d = pointToSegmentDist(lat, lng, aLat, aLng, bLat, bLng);
    if (d < min) min = d;
  }
  return min;
}

/** Distance from point P to the closest point on segment AB (all in degrees). */
function pointToSegmentDist(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng, dy = bLat - aLat;
  if (dx === 0 && dy === 0) return haversine(pLat, pLng, aLat, aLng);
  let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return haversine(pLat, pLng, aLat + dy * t, aLng + dx * t);
}

/**
 * Index of the step whose start is nearest the user's position — keeps the
 * instruction bar showing the *next* maneuver rather than one already passed.
 */
function findCurrentStepIndex(lat, lng, steps) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].location) continue;
    const d = haversine(lat, lng, steps[i].location[0], steps[i].location[1]);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// GPS tracking
// ---------------------------------------------------------------------------
function startGpsWatch(onUpdate) {
  if (!navigator.geolocation) { showToast('เบราว์เซอร์ไม่รองรับ GPS'); return null; }
  return navigator.geolocation.watchPosition(
    pos => onUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.heading, pos.coords.speed),
    err => console.warn('[NAV] GPS error:', err),
    GPS_OPTIONS,
  );
}

function stopGpsWatch(id) {
  if (id != null) navigator.geolocation.clearWatch(id);
}

// ---------------------------------------------------------------------------
// Minimize / resume
// ---------------------------------------------------------------------------
// Tracks the ETA text last written to the full instruction bar, so the mini
// bar can show the same values on minimize without reaching into nav-map.js's
// own DOM refs. Doesn't update live while minimized (updateEta() below still
// runs — GPS tracking never stops — but only the hidden full bar changes);
// tapping the mini bar to resume shows the current values immediately.
let lastEtaText = '—', lastRemainText = '—';

export function minimizeNavigation() {
  if (!state.navigating) return;
  hideNavOverlay();
  appEl.classList.remove('nav-active');
  miniNavEta.textContent = lastEtaText;
  miniNavDest.textContent = state.navDestination?.name || '—';
  miniNavBar.hidden = false;
}

export function resumeNavigation() {
  if (!state.navigating) return;
  miniNavBar.hidden = true;
  appEl.classList.add('nav-active');
  showNavOverlay();
}

navMinimizeBtn.addEventListener('click', minimizeNavigation);
miniNavBar.addEventListener('click', e => {
  if (e.target.closest('#miniNavEndBtn')) return;
  resumeNavigation();
});
miniNavBar.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('#miniNavEndBtn')) resumeNavigation();
});
miniNavEndBtn.addEventListener('click', e => {
  e.stopPropagation();
  stopNavigation();
});

// ---------------------------------------------------------------------------
// Navigation lifecycle
// ---------------------------------------------------------------------------
let lastRerouteTime = 0;

export async function startNavigation(restaurant) {
  if (state.navigating) {
    showToast('กำลังเดินทางไปร้านเดิมอยู่ กด "จบนำทาง" ก่อน ถึงจะเริ่มเส้นทางใหม่ได้');
    return;
  }

  const [uLat, uLng] = state.userLatLng;
  showToast('กำลังคำนวณเส้นทาง…');

  let route;
  try {
    route = await computeRoute(uLat, uLng, restaurant.lat, restaurant.lng);
  } catch (err) {
    console.error('[NAV] route fetch failed:', err);
    showToast('นำทางในแอปไม่สำเร็จ เปิด Google Maps แทน');
    window.open(directionsUrl(restaurant), '_blank', 'noopener');
    trackEvent('navigation_fallback', { reason: String(err?.message || err).slice(0, 100) });
    return;
  }

  state.navigating = true;
  state.navRoute = route;
  state.navDestination = restaurant;
  lastRerouteTime = 0;

  // Close the result sheet and hide the main app chrome
  hideResult();
  appEl.classList.add('nav-active');

  await initNavMap(uLat, uLng);
  drawRoute(route.coordinates, [restaurant.lat, restaurant.lng], restaurant.name);

  // Show initial instruction (skip step 0 — that's "depart", already implied)
  const steps = route.steps;
  if (steps.length > 1) {
    updateInstruction(steps[1].instructions || 'ตรงไป', formatDistance(steps[1].distanceMeters));
  }
  lastEtaText = formatDuration(route.durationSec);
  lastRemainText = formatDistance(route.distanceMeters);
  updateEta(lastEtaText, lastRemainText);

  state.navWatchId = startGpsWatch((lat, lng, heading) => {
    onGpsUpdate(lat, lng, heading);
  });

  trackEvent('navigation_started', { restaurant: restaurant.name });
}

function onGpsUpdate(lat, lng, heading) {
  if (!state.navigating || !state.navRoute) return;

  const dest = state.navDestination;
  const route = state.navRoute;
  const steps = route.steps;

  updateUserPosition(lat, lng, heading);

  const distToDest = haversine(lat, lng, dest.lat, dest.lng);
  if (distToDest < ARRIVAL_THRESHOLD_M) {
    handleArrival();
    return;
  }

  const stepIdx = findCurrentStepIndex(lat, lng, steps);
  const nextIdx = Math.min(stepIdx + 1, steps.length - 1);
  const nextStep = steps[nextIdx];
  const distToNext = nextStep.location
    ? haversine(lat, lng, nextStep.location[0], nextStep.location[1])
    : nextStep.distanceMeters;
  updateInstruction(nextStep.instructions || 'ตรงไป', formatDistance(distToNext));

  // Remaining ETA — sum distance/duration from the current step onward
  let remainDist = 0, remainDur = 0;
  for (let i = stepIdx; i < steps.length; i++) {
    remainDist += steps[i].distanceMeters;
    remainDur += steps[i].durationSec;
  }
  lastEtaText = formatDuration(remainDur);
  lastRemainText = formatDistance(remainDist);
  updateEta(lastEtaText, lastRemainText);
  if (!miniNavBar.hidden) miniNavEta.textContent = lastEtaText;

  // Off-route detection → re-route
  const offDist = distanceToLine(lat, lng, route.coordinates);
  if (offDist > OFF_ROUTE_THRESHOLD_M) {
    const now = Date.now();
    if (now - lastRerouteTime > REROUTE_COOLDOWN_MS) {
      lastRerouteTime = now;
      reroute(lat, lng);
    }
  }
}

async function reroute(lat, lng) {
  const dest = state.navDestination;
  showToast('กำลังคำนวณเส้นทางใหม่…');
  try {
    const route = await computeRoute(lat, lng, dest.lat, dest.lng);
    state.navRoute = route;
    drawRoute(route.coordinates, [dest.lat, dest.lng], dest.name);
    trackEvent('navigation_rerouted');
  } catch (err) {
    console.warn('[NAV] reroute failed:', err);
  }
}

function handleArrival() {
  // Bring the full view back so the celebration is actually seen — it lives
  // inside the overlay minimizeNavigation() hides.
  if (!miniNavBar.hidden) resumeNavigation();
  showArrived(state.navDestination.name);
  trackEvent('navigation_arrived', { restaurant: state.navDestination.name });
  // Auto-stop after showing the arrival message for a moment
  setTimeout(() => stopNavigation(), 3000);
}

export function stopNavigation() {
  if (!state.navigating) return;
  stopGpsWatch(state.navWatchId);
  state.navWatchId = null;
  state.navigating = false;
  state.navRoute = null;
  state.navDestination = null;

  destroyNavMap();
  miniNavBar.hidden = true;
  appEl.classList.remove('nav-active');
  // route-preview.js isolates every pin but the pick's before startNavigation()
  // is ever called, and nothing on the path from there back to here undid it —
  // the main map was left showing just that one pin after every trip.
  restoreAllMarkers();
  trackEvent('navigation_stopped');
}
