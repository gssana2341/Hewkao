// Map used exclusively during Navigation Mode. Completely separate from the
// Google Maps instance that powers restaurant search — it lives in its own
// overlay and is destroyed the moment navigation ends.
//
// Renders with MapLibre GL JS against OpenFreeMap's "liberty" vector style
// (openfreemap.org — free for commercial use, no API key, no rate limit,
// MIT-licensed if ever self-hosted) instead of Leaflet + raw OSM raster
// tiles: tile.openstreetmap.org's own policy says "commercial services...
// access may be withdrawn at any point" and blocks generic traffic outright.
// Vector tiles also mean a real 3D view is basically free — the map opens
// flat to show the whole route, then eases into a tilted, direction-facing
// "driving view" once tracking starts, the way Google/Apple Maps navigation
// does.

// v6's ESM build has no default export — only named ones. `Map` is aliased
// to avoid shadowing the built-in constructor.
import { Map as MaplibreMap, Marker, NavigationControl, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its tile-processing worker via `new URL(..., import.meta.url)`,
// which Vite rewrites to a hashed chunk path that was never emitted, so the
// worker silently 404s and the map hangs forever waiting on it. `?worker&url`
// (not plain `?url` — the worker imports a sibling chunk that needs bundling
// too) gives a real, self-contained built URL to point the worker at instead.
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(mapLibreWorkerUrl);

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const FOLLOW_PITCH = 58;
const OVERVIEW_TO_FOLLOW_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// DOM refs (created once, reused across navigations)
// ---------------------------------------------------------------------------
const navOverlay = document.getElementById('navOverlay');
const navMapEl = document.getElementById('navMap');
const navInstructionText = document.getElementById('navInstructionText');
const navInstructionDist = document.getElementById('navInstructionDistance');
const navEtaTime = document.getElementById('navEta');
const navRemaining = document.getElementById('navRemaining');
const navStopBtn = document.getElementById('navStopBtn');
const navArrivalOverlay = document.getElementById('navArrivalOverlay');
const navArrivalName = document.getElementById('navArrivalName');

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let map = null;
let userMarker = null;
let destMarker = null;
let followTimer = null;

// ---------------------------------------------------------------------------
// Custom marker elements
// ---------------------------------------------------------------------------
function buildUserMarkerEl() {
  const div = document.createElement('div');
  div.className = 'nav-user-dot';
  return div;
}

function buildDestMarkerEl(name) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-dest-marker';
  wrap.innerHTML = `
    <div class="nav-dest-ring"></div>
    <div class="nav-dest-dot"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"/></svg></div>
    <div class="nav-dest-tooltip">${name}</div>`;
  return wrap;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the map inside the nav overlay and show it.
 * @returns {Promise<void>} resolves once the style has finished loading —
 *   sources/layers can't be added before that.
 */
export function initNavMap(lat, lng) {
  navOverlay.hidden = false;
  navArrivalOverlay.hidden = true;
  clearTimeout(followTimer);

  if (map) { map.remove(); map = null; }

  map = new MaplibreMap({
    container: navMapEl,
    style: MAP_STYLE,
    center: [lng, lat],
    zoom: 16,
    pitch: 0,
    bearing: 0,
    attributionControl: { compact: true }, // OpenFreeMap requires attribution; text comes from its own style JSON
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  // MapLibre reports style/tile failures through this event, not a thrown
  // exception — without a handler they fail completely silently.
  map.on('error', e => console.error('[NAV] MapLibre error:', e.error));

  userMarker = new Marker({ element: buildUserMarkerEl(), rotationAlignment: 'map' })
    .setLngLat([lng, lat])
    .addTo(map);

  return new Promise(resolve => map.once('load', resolve));
}

/** Draw the route line and destination marker. `coords` is [[lat,lng],…]. */
export function drawRoute(coords, [destLat, destLng], destName) {
  if (!map) return;

  const lngLats = coords.map(([lat, lng]) => [lng, lat]);
  const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: lngLats } };

  if (map.getSource('route')) {
    map.getSource('route').setData(geojson);
  } else {
    map.addSource('route', { type: 'geojson', data: geojson });
    // Casing first (wider, behind), then the main line on top — same trick
    // as a two-stroke SVG path for a road that reads clearly over the basemap.
    map.addLayer({
      id: 'route-casing', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1a56db', 'line-width': 10, 'line-opacity': 0.3 },
    });
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#4285f4', 'line-width': 6, 'line-opacity': 0.9 },
    });
  }

  if (destMarker) destMarker.remove();
  destMarker = new Marker({ element: buildDestMarkerEl(destName), anchor: 'center' })
    .setLngLat([destLng, destLat])
    .addTo(map);

  const lats = coords.map(c => c[0]), lngs = coords.map(c => c[1]);
  const bounds = new LngLatBounds(
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  );
  map.fitBounds(bounds, { padding: 64, duration: 0 });

  // Show the whole route flat first, then tilt into a direction-facing 3D
  // "driving view" and zoom to the user — same beat the original had for
  // switching from overview to following, now with a pitch transition too.
  clearTimeout(followTimer);
  followTimer = setTimeout(() => {
    if (!map || !userMarker) return;
    map.easeTo({ center: userMarker.getLngLat(), zoom: 17, pitch: FOLLOW_PITCH, duration: 900 });
  }, OVERVIEW_TO_FOLLOW_DELAY_MS);
}

/** Move the user marker and re-centre/rotate the camera to face `heading`. */
export function updateUserPosition(lat, lng, heading) {
  if (!map || !userMarker) return;
  userMarker.setLngLat([lng, lat]);
  if (heading != null && !isNaN(heading)) userMarker.setRotation(heading);

  map.easeTo({
    center: [lng, lat],
    bearing: heading != null && !isNaN(heading) ? heading : map.getBearing(),
    pitch: map.getPitch() || FOLLOW_PITCH,
    duration: 500,
  });
}

/** Update the instruction bar at the top. */
export function updateInstruction(text, distText) {
  navInstructionText.textContent = text;
  navInstructionDist.textContent = distText;
}

/** Update the ETA bar at the bottom. */
export function updateEta(timeText, distText) {
  navEtaTime.textContent = timeText;
  navRemaining.textContent = distText;
}

/** Show the arrival celebration overlay. */
export function showArrived(restaurantName) {
  navArrivalOverlay.hidden = false;
  navArrivalName.textContent = restaurantName;
}

/** Tear down the map and hide the overlay. */
export function destroyNavMap() {
  clearTimeout(followTimer);
  if (map) { map.remove(); map = null; }
  userMarker = null;
  destMarker = null;
  navOverlay.hidden = true;
}

// Lazy import to break the circular dependency (navigation.js ↔ nav-map.js).
navStopBtn.addEventListener('click', () => {
  import('./navigation.js').then(m => m.stopNavigation());
});
