import { state } from './state.js';
import { formatDistance, formatDuration, haversine, showToast } from './utils.js';
import { isolateMarker, restoreAllMarkers, flyTo } from './map.js';
import { hideResult } from './spin-result.js';

const listPanel = document.getElementById('listPanel');
const spinBtn = document.getElementById('spinBtn');
const locateBtn = document.getElementById('locateBtn');
const navBar = document.getElementById('navBar');
const navEtaEl = document.getElementById('navEta');
const navDestEl = document.getElementById('navDest');
const navEndBtn = document.getElementById('navEndBtn');

export function clearRoute() {
  if (state.routeLayer) { state.routeLayer.setMap(null); state.routeLayer = null; }
}

export async function drawRoute(r) {
  clearRoute();
  try {
    const [uLat, uLng] = state.userLatLng;
    const url = `https://router.project-osrm.org/route/v1/driving/${uLng},${uLat};${r.lng},${r.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('no route');
    const route = data.routes[0];
    const path = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    state.routeLayer = new google.maps.Polyline({
      path,
      strokeColor: '#ff5a36',
      strokeWeight: 6,
      strokeOpacity: 0.9,
      zIndex: 1,
      map: state.map,
    });
    navEtaEl.textContent = `${formatDuration(route.duration)} · ${formatDistance(route.distance)}`;
  } catch (err) {
    navEtaEl.textContent = 'หาเส้นทางไม่สำเร็จ';
    showToast('หาเส้นทางไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
}

export function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Keeps the destination pinned toward the top of the screen: the map's bearing is
// simply the compass direction from the user's current spot to the destination,
// recomputed as they move. No compass/magnetometer needed, so it works everywhere.
export function pointMapAtDestination() {
  if (!state.selected || !state.map.setHeading) return;
  const [lat, lng] = state.userLatLng;
  const bearing = bearingBetween(lat, lng, state.selected.lat, state.selected.lng);
  state.map.setHeading(bearing);
}

export function onNavPosition(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  state.userLatLng = [lat, lng];
  if (state.userMarker) state.userMarker.position = { lat, lng };

  pointMapAtDestination();
  flyTo(state.userLatLng, Math.max(state.map.getZoom(), 17));

  if (state.selected) {
    navEtaEl.textContent = formatDistance(haversine(lat, lng, state.selected.lat, state.selected.lng));
  }
}

export function onNavPositionError() {
  showToast('ติดตามตำแหน่งสดไม่สำเร็จ');
}

export async function startNavigation(r) {
  if (state.navigating) return;
  state.navigating = true;
  state.selected = r;
  hideResult();

  listPanel.hidden = true;
  spinBtn.hidden = true;
  locateBtn.hidden = true;
  navBar.hidden = false;
  navDestEl.textContent = r.name;
  navEtaEl.textContent = 'กำลังหาเส้นทาง…';

  // Show only the picked restaurant on the map while navigating.
  isolateMarker(r);

  if (navigator.geolocation) {
    state.watchId = navigator.geolocation.watchPosition(onNavPosition, onNavPositionError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    });
  }

  pointMapAtDestination();
  flyTo(state.userLatLng, 18);
  await drawRoute(r);
}

export function stopNavigation() {
  if (!state.navigating) return;
  state.navigating = false;

  if (state.watchId != null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
  if (state.map.setHeading) state.map.setHeading(0);

  clearRoute();
  navBar.hidden = true;
  listPanel.hidden = false;
  spinBtn.hidden = false;
  locateBtn.hidden = false;

  restoreAllMarkers();
  flyTo(state.userLatLng, 16);
}

navEndBtn.addEventListener('click', stopNavigation);
