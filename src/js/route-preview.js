import { state } from './state.js';
import { formatDistance, formatDuration, showToast } from './utils.js';
import { computeRoute } from './routes-api.js';
import { drawRoute, clearRoute, isolateMarker, restoreAllMarkers, hasRoute } from './map.js';
import { hideResult, directionsUrl } from './spin-result.js';
import { setListCollapsed, isListCollapsed } from './restaurant-list.js';
import { recordPick } from './popularity.js';
import { trackEvent } from './analytics.js';

/* =========================================================================
   HEWKAO — route drawn on the main map, before any navigating happens.

   "เริ่มเดินทาง" used to jump straight into turn-by-turn. Plenty of the time
   the question is just "where is this place, and is it far?", so the route
   now appears on the map already on screen — other pins hidden, list panel
   out of the way, nothing but the shop and the user — and guided navigation
   waits behind its own button. Nothing extra is billed for this: the Go
   button already fetched the route. MapLibre (~300 KB) now only loads for
   people who actually ask to be guided.
   ========================================================================= */

const bar = document.getElementById('routePreviewBar');
const metaEl = document.getElementById('routePreviewMeta');
const nameEl = document.getElementById('routePreviewName');
const startBtn = document.getElementById('routePreviewStartBtn');
const closeBtn = document.getElementById('routePreviewCloseBtn');

let previewed = null;
let listWasCollapsed = false;

export async function showRoutePreview(restaurant) {
  showToast('กำลังคำนวณเส้นทาง…');
  let route;
  try {
    route = await computeRoute(state.userLatLng[0], state.userLatLng[1], restaurant.lat, restaurant.lng);
  } catch (err) {
    console.error('[HEWKAO] route fetch failed:', err);
    showToast('หาเส้นทางไม่สำเร็จ เปิด Google Maps แทน');
    window.open(directionsUrl(restaurant), '_blank', 'noopener');
    trackEvent('route_preview_fallback', { reason: String(err?.message || err).slice(0, 100) });
    return;
  }

  previewed = restaurant;
  // Not a direct class read: desktop collapses a sidebar, mobile drags a
  // bottom sheet — isListCollapsed() knows which one is live at this width.
  listWasCollapsed = isListCollapsed();
  // Counted here, not on every spin that happens to land on this shop: this
  // is the moment the user actually asked to go, which is what the fire
  // badge (popularity.js) means to reflect.
  recordPick(restaurant.id);

  // hideResult() puts every pin back, so the pick is isolated again right
  // after — same frame, so no flicker of the other pins returning.
  hideResult();
  isolateMarker(restaurant);
  setListCollapsed(true, { keepCenter: false, persist: false });

  await drawRoute(route.coordinates);

  metaEl.textContent = `${formatDuration(route.durationSec)} · ${formatDistance(route.distanceMeters)}`;
  nameEl.textContent = restaurant.name;
  bar.hidden = false;
  trackEvent('route_previewed', { category: restaurant.category });
}

// Leaves the map as it was: route gone, every pin back, list panel however
// the user had it before the preview took it away.
export function hideRoutePreview() {
  if (!previewed) return;
  previewed = null;
  bar.hidden = true;
  clearRoute();
  restoreAllMarkers();
  setListCollapsed(listWasCollapsed, { persist: false });
}

// Anything that replaces the pick (a new spin, tapping another shop) clears
// a stale route without restoring what the preview had tucked away — the new
// result does its own isolating and the list stays as the user left it.
export function dropRoutePreview() {
  if (!hasRoute() && !previewed) return;
  previewed = null;
  bar.hidden = true;
  clearRoute();
}

startBtn.addEventListener('click', async () => {
  const restaurant = previewed;
  if (!restaurant) return;
  bar.hidden = true;
  previewed = null;
  clearRoute();
  // Nav mode covers the app chrome anyway; putting the panel back now means
  // the layout is the user's own again once they end the trip.
  setListCollapsed(listWasCollapsed, { persist: false });
  // Dynamic: keeps MapLibre GL JS out of the initial download for everyone
  // who only wanted to see where the shop is.
  const { startNavigation } = await import('./navigation.js');
  startNavigation(restaurant);
});

closeBtn.addEventListener('click', hideRoutePreview);
