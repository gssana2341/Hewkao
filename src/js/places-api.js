import { PRICE_LABEL } from './constants.js';
import { haversine } from './utils.js';
import { getRadius } from './preferences.js';

// Named MAPSKEY (not VITE_-prefixed) — see envPrefix in vite.config.js.
const GOOGLE_API_KEY = import.meta.env.MAPSKEY;

const PLACES_INCLUDED_TYPES = ['restaurant', 'cafe', 'bakery', 'fast_food_restaurant', 'meal_takeaway'];
// Hotels get tagged with a generic 'restaurant' type too (for their in-house
// dining), so without this a search near any hotel-dense area comes back
// half full of hotels instead of standalone restaurants/chains — confirmed
// by testing near Siam, Bangkok: 10 of the top 20 results were hotels.
// Malls and shops get the same generic tag for their food courts: Central
// Park and The Market Bangkok both came back as "restaurants" near Siam.
const PLACES_EXCLUDED_PRIMARY_TYPES = [
  'lodging', 'hotel', 'motel', 'resort_hotel', 'extended_stay_hotel',
  'bed_and_breakfast', 'guest_house', 'hostel', 'inn',
  'shopping_mall', 'department_store', 'supermarket', 'convenience_store', 'gas_station',
];
const EXCLUDED_PRIMARY_TYPE_SET = new Set(PLACES_EXCLUDED_PRIMARY_TYPES);

// Pro + Enterprise fields only. Asking for any Atmosphere field (reviews,
// dineIn, takeout, delivery, …) bills the whole request at the Enterprise +
// Atmosphere rate, so reviews are a link out to Google Maps instead.
const PLACES_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.location', 'places.types', 'places.primaryType',
  'places.formattedAddress', 'places.googleMapsUri', 'places.photos',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.priceLevel',
  'places.rating', 'places.userRatingCount', 'places.currentOpeningHours.openNow',
].join(',');

// Nearby Search's hard cap per request — it has no pagination.
const NEARBY_MAX_RESULTS = 20;

// One size serves both the 76px list thumbnail and the result sheet photo, so
// a shop's photo only ever needs one request per visit.
const PHOTO_MAX_WIDTH_PX = 480;

// Keyword hints for when Google leaves a place with only generic types
// (restaurant/food/point_of_interest) — very common for small local Thai
// eateries. Order matters: checked top to bottom, first match wins.
const NAME_CATEGORY_HINTS = [
  ['cafe', ['กาแฟ', 'คาเฟ่', 'ชานม', 'เบเกอรี่', 'ของหวาน', 'ไอศกรีม', 'เค้ก', 'คุกกี้', 'ขนมปัง', 'coffee', 'cafe', 'bakery']],
  ['japanese', ['ซูชิ', 'ราเมน', 'อุด้ง', 'ยากินิกุ', 'เทมปุระ', 'ชาบูญี่ปุ่น', 'sushi', 'ramen', 'japanese']],
  ['korean', ['เกาหลี', 'คิมจิ', 'ทัคคาลบี', 'ชาบูเกาหลี', 'korean']],
  ['chinese', ['หมาล่า', 'ติ่มซำ', 'ก๋วยเตี๋ยวเป็ด', 'บะหมี่เกี๊ยว', 'โจ๊ก', 'ข้าวต้ม', 'จีน', 'chinese']],
  ['seafood', ['ทะเล', 'ซีฟู้ด', 'กุ้ง', 'ปู', 'หอย', 'ปลาหมึก', 'seafood']],
  ['western', ['เบอร์เกอร์', 'พิซซ่า', 'สเต็ก', 'พาสต้า', 'อิตาเลียน', 'burger', 'pizza', 'steak', 'pasta']],
  ['fastfood', ['ไก่ทอด', 'เฟรนช์ฟราย', 'fried chicken', 'fast food']],
  ['thai', ['ผัดไทย', 'ส้มตำ', 'ก๋วยเตี๋ยว', 'ก๋วยจั๊บ', 'ข้าวมันไก่', 'ข้าวขาหมู', 'ต้มยำ', 'แกง', 'ลาบ', 'อาหารไทย', 'ครัว']],
];

export function mapGoogleCategory(types, name = '') {
  const has = t => (types || []).includes(t);
  if (has('cafe') || has('coffee_shop') || has('bakery') || has('dessert_shop') || has('ice_cream_shop')) return 'cafe';
  if (has('fast_food_restaurant') || has('hamburger_restaurant')) return 'fastfood';
  if (has('thai_restaurant')) return 'thai';
  if (has('japanese_restaurant') || has('sushi_restaurant') || has('ramen_restaurant')) return 'japanese';
  if (has('korean_restaurant')) return 'korean';
  if (has('chinese_restaurant') || has('dim_sum_restaurant')) return 'chinese';
  if (has('seafood_restaurant')) return 'seafood';
  if (has('italian_restaurant') || has('pizza_restaurant') || has('american_restaurant') || has('steak_house') || has('french_restaurant')) return 'western';

  const n = name.toLowerCase();
  for (const [cat, words] of NAME_CATEGORY_HINTS) {
    if (words.some(w => n.includes(w))) return cat;
  }
  return 'other';
}

// Every request to the photo media endpoint is billed (Place Photos). With
// skipHttpRedirect it answers with the image's photoUri rather than the image,
// and that URI is reused everywhere the shop's photo appears — list card and
// result sheet — so showing it again costs nothing. Memory only, for this
// visit: Google's policy forbids caching photo names, and they come fresh
// with every search anyway.
const photoUriByName = new Map();

export function getPhotoUri(r) {
  if (!r.photoName) return Promise.resolve('');
  if (!photoUriByName.has(r.photoName)) {
    const url = `https://places.googleapis.com/v1/${r.photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true&key=${GOOGLE_API_KEY}`;
    const request = fetch(url)
      .then(res => (res.ok ? res.json() : null))
      .then(data => data?.photoUri || '')
      .catch(() => '');
    photoUriByName.set(r.photoName, request);
  }
  return photoUriByName.get(r.photoName);
}

async function searchNearby(lat, lng, rankPreference) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: PLACES_INCLUDED_TYPES,
      excludedPrimaryTypes: PLACES_EXCLUDED_PRIMARY_TYPES,
      maxResultCount: NEARBY_MAX_RESULTS,
      rankPreference,
      languageCode: 'th',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: getRadius() },
      },
    }),
  });
  if (!res.ok) throw new Error(`nearby ${rankPreference} error ${res.status}`);
  const data = await res.json();
  return data.places || [];
}

// Extra searches in dense areas are centred this many times the nearest-20
// reach away from the user (north, south, east, west), and never closer than
// the minimum, so they don't just overlap the first search.
const RING_STEP_FACTOR = 1.5;
const RING_STEP_MIN_M = 200;

// Nearby Search returns at most 20 places and ranking by popularity (the API
// default) let far-off famous places crowd out shops next to the user, so the
// nearest 20 always load first. Only when that hits the cap — a dense area,
// where those 20 reach barely a few hundred metres while Google's own map
// shows far more shops around — do four more distance searches run from
// points around the user, plus one by popularity for well-known spots further
// out. Measured at มทส. ประตู 1 against every shop any method found: the
// earlier 2 searches covered 38% of shops within 500 m, these 6 cover 95%
// (paginated Text Search managed 20%). Sparse areas still cost one search.
export async function fetchNearby(lat, lng) {
  const nearest = await searchNearby(lat, lng, 'DISTANCE');
  if (nearest.length < NEARBY_MAX_RESULTS) return nearest;

  const reach = Math.max(...nearest.map(p => haversine(lat, lng, p.location.latitude, p.location.longitude)));
  const step = Math.max(reach * RING_STEP_FACTOR, RING_STEP_MIN_M);
  const dLat = step / 111320;
  const dLng = step / (111320 * Math.cos((lat * Math.PI) / 180));
  const extra = await Promise.all([
    searchNearby(lat + dLat, lng, 'DISTANCE'),
    searchNearby(lat - dLat, lng, 'DISTANCE'),
    searchNearby(lat, lng + dLng, 'DISTANCE'),
    searchNearby(lat, lng - dLng, 'DISTANCE'),
    searchNearby(lat, lng, 'POPULARITY'),
  ].map(search => search.catch(err => {
    console.warn('[HEWKAO] extra nearby search failed:', err);
    return [];
  })));

  const radius = getRadius();
  const byId = new Map(nearest.map(p => [p.id, p]));
  for (const p of extra.flat()) {
    if (byId.has(p.id) || !p.location) continue;
    // Searches centred away from the user can reach past the chosen radius.
    if (haversine(lat, lng, p.location.latitude, p.location.longitude) > radius) continue;
    byId.set(p.id, p);
  }
  return [...byId.values()];
}

function absoluteUrl(uri) {
  if (!uri) return '';
  return uri.startsWith('//') ? `https:${uri}` : uri;
}

// Shops Google knows little about (no photo, hardly any reviews, unknown
// hours, only a generic category) go below the rest of the list, nearest
// first within each group. They stay on the map and in the random pool —
// small shops getting a fair chance is the point — they just don't lead the
// list ahead of shops a user can actually judge before going.
const SPARSE_INFO_SCORE = 3; // out of 6
function infoScore(r) {
  return (r.photoName ? 2 : 0)
    + (r.ratingCount >= 5 ? 2 : r.ratingCount >= 1 ? 1 : 0)
    + (r.openNow !== null ? 1 : 0)
    + (r.category !== 'other' ? 1 : 0);
}

export function processResults(places, [uLat, uLng]) {
  const list = places
    .filter(p => p.displayName?.text && p.location && !EXCLUDED_PRIMARY_TYPE_SET.has(p.primaryType))
    .map(p => {
      const photo = p.photos?.[0];
      const author = photo?.authorAttributions?.[0];
      return {
        id: p.id,
        name: p.displayName.text,
        lat: p.location.latitude,
        lng: p.location.longitude,
        category: mapGoogleCategory(p.types, p.displayName.text),
        address: p.formattedAddress || '',
        tel: p.internationalPhoneNumber || '',
        website: p.websiteUri || '',
        mapsUrl: p.googleMapsUri || '',
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? 0,
        priceLabel: PRICE_LABEL[p.priceLevel] || '',
        photoName: photo?.name || '',
        photoAuthor: author?.displayName || '',
        photoAuthorUrl: absoluteUrl(author?.uri),
        openNow: p.currentOpeningHours?.openNow ?? null,
        distance: haversine(uLat, uLng, p.location.latitude, p.location.longitude),
      };
    })
    .map(r => ({ ...r, sparse: infoScore(r) < SPARSE_INFO_SCORE }));
  list.sort((a, b) => (a.sparse - b.sparse) || (a.distance - b.distance));
  return list;
}
