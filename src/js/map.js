import { state } from './state.js';
import { catOf, GOOGLE_MAP_ID } from './constants.js';
import { showToast } from './utils.js';
import { trackEvent } from './analytics.js';
import { getVisibleRestaurants } from './restaurant-list.js';
import { showResult } from './spin-result.js';

const layerBtn = document.getElementById('layerBtn');
const locateBtn = document.getElementById('locateBtn');

// Google calls this global when it rejects the API key (wrong key, a domain
// missing from the referrer allowlist, billing disabled). Otherwise the map
// just turns into a grey "Oops" box, so tell the user and record it.
window.gm_authFailure = () => {
  showToast('แผนที่ใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง');
  trackEvent('maps_auth_failed');
};

// colorScheme is immutable after a Map is constructed (setOptions has no
// effect on it), so switching light/dark means building a whole new Map
// instance rather than restyling the existing one. mapTypeId (satellite) has
// no such restriction, so that toggle stays a cheap setMapTypeId() call.
export async function buildMap(center, zoom, colorSchemeName) {
  const { Map } = await google.maps.importLibrary('maps');
  const { ColorScheme } = await google.maps.importLibrary('core');
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
  state.AdvancedMarkerElementCtor = AdvancedMarkerElement;

  return new Map(document.getElementById('map'), {
    center,
    zoom,
    mapId: GOOGLE_MAP_ID,
    colorScheme: ColorScheme[colorSchemeName],
    disableDefaultUI: true,
    gestureHandling: 'greedy',
    clickableIcons: false,
  });
}

export function buildUserDotEl() {
  const div = document.createElement('div');
  div.className = 'user-dot';
  return div;
}

function buildPinEl(r, isSelected) {
  const cat = catOf(r);
  const div = document.createElement('div');
  // The picked marker always shows the same "selected" green (set in CSS) so it
  // never gets mistaken for a regular category color — only unpicked pins get an
  // inline per-category color.
  div.className = 'pin' + (isSelected ? ' selected' : '');
  if (!isSelected) div.style.background = cat.color;
  div.innerHTML = `<span>${cat.icon}</span>`;
  return div;
}

export async function initMap() {
  state.map = await buildMap({ lat: state.userLatLng[0], lng: state.userLatLng[1] }, 16, 'LIGHT');
  state.userMarker = new state.AdvancedMarkerElementCtor({
    map: state.map,
    position: { lat: state.userLatLng[0], lng: state.userLatLng[1] },
    content: buildUserDotEl(),
    zIndex: 1000,
  });
}

export async function setMapColorScheme(colorSchemeName) {
  const center = state.map.getCenter();
  const zoom = state.map.getZoom();

  state.markersById.forEach(m => { m.map = null; });
  state.markersById.clear();
  if (state.userMarker) state.userMarker.map = null;

  state.map = await buildMap({ lat: center.lat(), lng: center.lng() }, zoom, colorSchemeName);
  state.userMarker = new state.AdvancedMarkerElementCtor({
    map: state.map,
    position: { lat: state.userLatLng[0], lng: state.userLatLng[1] },
    content: buildUserDotEl(),
    zIndex: 1000,
  });

  // Markers were just wiped above, so renderMarkers() must run first —
  // isolateMarker() only hides/shows markers that already exist. Keep "the
  // pick" isolated if its result sheet is still open, or if its route is
  // drawn — the route view deliberately shows only the shop and the user.
  renderMarkers();
  const showingPick = !document.getElementById('resultSheet').hidden || hasRoute();
  if (state.selected && showingPick) isolateMarker(state.selected);
  if (routeCoords) paintRoute(routeCoords);
}

export function flyTo([lat, lng], zoom) {
  state.map.moveCamera({ center: { lat, lng }, zoom });
}

/* ---------- Route line on the main map ---------- */
// Drawn straight onto the map the user is already looking at, so "where is
// this place?" costs nothing more than the route request the Go button
// already makes — no switching into nav mode, and MapLibre (~300 KB) stays
// unloaded until someone actually asks to be guided there.
let routeLine = null;
let routeCoords = null;

export function hasRoute() { return !!routeCoords; }

// Painting is split from framing because switching map style rebuilds the Map
// instance from scratch (see setMapColorScheme): the line has to be put back
// on the new instance without yanking the camera the user just kept.
async function paintRoute(coords) {
  const { Polyline } = await google.maps.importLibrary('maps');
  routeLine?.setMap(null);
  routeLine = new Polyline({
    path: coords.map(([lat, lng]) => ({ lat, lng })),
    map: state.map,
    strokeColor: '#ff5a36',
    strokeOpacity: 0.95,
    strokeWeight: 5,
  });
}

export async function drawRoute(coords) {
  routeCoords = coords;
  await paintRoute(coords);
  const bounds = new google.maps.LatLngBounds();
  coords.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
  // Padding keeps both ends clear of the top bar and the bottom controls.
  state.map.fitBounds(bounds, { top: 90, right: 60, bottom: 180, left: 60 });
}

export function clearRoute() {
  routeLine?.setMap(null);
  routeLine = null;
  routeCoords = null;
}

export function renderMarkers() {
  state.markersById.forEach(m => { m.map = null; });
  state.markersById.clear();
  getVisibleRestaurants().forEach(r => {
    const marker = new state.AdvancedMarkerElementCtor({
      map: state.map,
      position: { lat: r.lat, lng: r.lng },
      content: buildPinEl(r, false),
    });
    marker.addListener('click', () => showResult(r));
    state.markersById.set(r.id, marker);
  });
}

// Hides every marker except r's, and restyles r's pin so it reads clearly as "the pick".
export function isolateMarker(r) {
  state.markersById.forEach((marker, id) => {
    if (id === r.id) {
      marker.content = buildPinEl(r, true);
      marker.map = state.map;
    } else {
      marker.map = null;
    }
  });
}

export function restoreAllMarkers() {
  state.markersById.forEach((marker, id) => {
    const r = state.restaurants.find(x => x.id === id);
    if (r) marker.content = buildPinEl(r, false);
    marker.map = state.map;
  });
}

layerBtn.addEventListener('click', async () => {
  layerBtn.disabled = true;
  if (state.currentMapStyle === 'light') {
    state.currentMapStyle = 'satellite';
    state.map.setMapTypeId('satellite');
  } else if (state.currentMapStyle === 'satellite') {
    state.currentMapStyle = 'dark';
    await setMapColorScheme('DARK');
  } else {
    state.currentMapStyle = 'light';
    await setMapColorScheme('LIGHT');
  }
  layerBtn.classList.toggle('active', state.currentMapStyle !== 'light');
  layerBtn.disabled = false;
});

locateBtn.addEventListener('click', () => { if (state.map) flyTo(state.userLatLng, 16); });

window.addEventListener('resize', () => { if (state.map) google.maps.event.trigger(state.map, 'resize'); });
