import { state } from './state.js';
import { catOf, GOOGLE_MAP_ID } from './constants.js';
import { getVisibleRestaurants } from './restaurant-list.js';
import { showResult } from './spin-result.js';
import { drawRoute, pointMapAtDestination } from './navigation.js';

const layerBtn = document.getElementById('layerBtn');
const locateBtn = document.getElementById('locateBtn');

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
  const wasNavigating = state.navigating && state.selected;

  state.markersById.forEach(m => { m.map = null; });
  state.markersById.clear();
  if (state.userMarker) state.userMarker.map = null;
  if (state.routeLayer) { state.routeLayer.setMap(null); state.routeLayer = null; }

  state.map = await buildMap({ lat: center.lat(), lng: center.lng() }, zoom, colorSchemeName);
  state.userMarker = new state.AdvancedMarkerElementCtor({
    map: state.map,
    position: { lat: state.userLatLng[0], lng: state.userLatLng[1] },
    content: buildUserDotEl(),
    zIndex: 1000,
  });

  // Markers were just wiped above, so renderMarkers() must run first even
  // when navigating — isolateMarker() only hides/shows markers that already
  // exist, it can't isolate one out of an empty set.
  renderMarkers();
  if (wasNavigating) {
    isolateMarker(state.selected);
    await drawRoute(state.selected);
    pointMapAtDestination();
  }
}

export function flyTo([lat, lng], zoom) {
  state.map.moveCamera({ center: { lat, lng }, zoom });
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
