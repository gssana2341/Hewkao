// Drive directions from Google Routes API, replacing the OSRM public demo
// server (router.project-osrm.org) that navigation.js used before — its
// policy restricts it to "reasonable, non-commercial use-cases" and caps
// everyone sharing it to 1 request/second, with no uptime guarantee. This
// reuses the same Maps Platform key as places-api.js and maps-loader.js, so
// Routes API just needs enabling alongside them in Cloud Console.

const GOOGLE_API_KEY = import.meta.env.MAPSKEY;

// Kept to exactly what navigation.js uses for the route line, ETA and
// turn-by-turn steps. routingPreference is pinned to TRAFFIC_UNAWARE and
// travelMode to DRIVE so every call bills at the Essentials SKU ($5/1,000
// requests, 10,000 free/month) — TRAFFIC_AWARE or TRAFFIC_AWARE_OPTIMAL push
// a request onto the pricier Pro SKU instead.
const FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.geoJsonLinestring',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.startLocation',
].join(',');

function latLng(lat, lng) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

// Response coordinates are GeoJSON [lng, lat]; the rest of the app works in
// [lat, lng] (see state.userLatLng), so this is the one place that flips them.
function toLatLngPairs(geoJsonLinestring) {
  return (geoJsonLinestring?.coordinates || []).map(([lng, lat]) => [lat, lng]);
}

function parseDurationSeconds(s) {
  return s ? parseInt(s, 10) || 0 : 0; // "123s" -> 123
}

/**
 * Fetch driving directions to a restaurant.
 * @returns {Promise<{distanceMeters:number, durationSec:number,
 *   coordinates:[number,number][],
 *   steps:{distanceMeters:number, durationSec:number, maneuver:string,
 *     instructions:string, location:[number,number]|null}[]}>}
 */
export async function computeRoute(fromLat, fromLng, toLat, toLng) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin: latLng(fromLat, fromLng),
      destination: latLng(toLat, toLng),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      polylineQuality: 'HIGH_QUALITY',
      polylineEncoding: 'GEO_JSON_LINESTRING',
      languageCode: 'th',
      units: 'METRIC',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `routes error ${res.status}`);
  const route = data.routes?.[0];
  if (!route) throw new Error('no route');

  const steps = (route.legs?.[0]?.steps || []).map(s => ({
    distanceMeters: s.distanceMeters || 0,
    durationSec: parseDurationSeconds(s.staticDuration),
    maneuver: s.navigationInstruction?.maneuver || '',
    instructions: s.navigationInstruction?.instructions || '',
    location: s.startLocation?.latLng
      ? [s.startLocation.latLng.latitude, s.startLocation.latLng.longitude]
      : null,
  }));

  return {
    distanceMeters: route.distanceMeters || 0,
    durationSec: parseDurationSeconds(route.duration),
    coordinates: toLatLngPairs(route.polyline?.geoJsonLinestring),
    steps,
  };
}
