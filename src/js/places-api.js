import { PRICE_LABEL } from './constants.js';
import { haversine } from './utils.js';
import { getRadius } from './preferences.js';

// Named MAPSKEY (not VITE_-prefixed) — see envPrefix in vite.config.js.
const GOOGLE_API_KEY = import.meta.env.MAPSKEY;

// A specific cuisine (mala, hot pot, chinese, korean_barbecue, …) is a
// *subtype* of 'restaurant' in Google's type system, and Nearby Search
// matches those automatically — confirmed against 18 real mala/hot-pot/
// buffet/BBQ places, every one already had 'restaurant' in its types array.
// So this list only needs the ROOT categories, including the few that are
// siblings of 'restaurant' rather than children of it and so wouldn't
// otherwise match: bar, deli, food_court, meal_delivery, food_delivery.
// One real gap this can't close: a small number of places on Google Maps
// carry only the generic 'food' tag with no Table A subtype at all — that
// tag can't be used in includedTypes (Table B), so no type list, however
// broad, will surface them; the shop just needs its Google Maps listing
// filled in. Most "missing" places are the 20-result-per-search cap, not
// type filtering — see fetchNearby()'s comment below.
const PLACES_INCLUDED_TYPES = [
  'restaurant', 'cafe', 'bakery', 'fast_food_restaurant', 'meal_takeaway',
  'bar', 'deli', 'food_court', 'meal_delivery', 'food_delivery',
];
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

// Budget for one fetchNearby() sweep. Only dense areas ever spend it: a quiet
// neighbourhood answers in a single search. Measured at มทส. ประตู 1, one of
// the densest spots there is — 1 search finds 20 shops, 5 finds 58, 9 finds
// 65, and it plateaus at 91 by around 21. Raising this buys more of that tail
// at a real Places bill per extra search, so it stays one number to turn.
const MAX_SEARCH_CALLS = 12;
// Below this, splitting a cell further costs searches for almost no new ground.
// Kept under the smallest radius the user can pick (200 m) so even that one
// still splits when a spot is dense enough to truncate it.
const MIN_CELL_RADIUS_M = 100;
// Cells per round trip — the sweep is otherwise strictly sequential and slow.
const SEARCH_BATCH_SIZE = 4;

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
const settledUriByName = new Map();

export function getPhotoUri(r) {
  if (!r.photoName) return Promise.resolve('');
  if (!photoUriByName.has(r.photoName)) {
    const url = `https://places.googleapis.com/v1/${r.photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true&key=${GOOGLE_API_KEY}`;
    const request = fetch(url)
      .then(res => (res.ok ? res.json() : null))
      .then(data => data?.photoUri || '')
      .catch(() => '')
      .then(uri => { settledUriByName.set(r.photoName, uri); return uri; });
    photoUriByName.set(r.photoName, request);
  }
  return photoUriByName.get(r.photoName);
}

// Synchronous, and deliberately never starts a request: '' means "not paid
// for yet". The spin track uses this to show photos already fetched for the
// list without billing Place Photos for filler shops nobody lands on.
export function getSettledPhotoUri(r) {
  return (r.photoName && settledUriByName.get(r.photoName)) || '';
}

async function searchNearby(lat, lng, radius) {
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
      rankPreference: 'DISTANCE',
      languageCode: 'th',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
    }),
  });
  if (!res.ok) throw new Error(`nearby error ${res.status}`);
  const data = await res.json();
  return data.places || [];
}

// Four children at ±r/2 with radius 0.75r, which covers the parent circle
// completely — a point on the parent's edge lies at most 0.707r from the
// nearest child's centre. Cheaper-looking children (half the radius, offset a
// quarter) leave a ring near the parent's edge uncovered, and because every
// cell then answers under the cap the sweep looks like it finished while those
// edge shops were never searched for: measured at มทส., 62 shops found that
// way against 87 with children that actually cover.
function subdivide(cell) {
  const offset = cell.radius / 2;
  const dLat = offset / 111320;
  const dLng = offset / (111320 * Math.cos((cell.lat * Math.PI) / 180));
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sLat, sLng]) => ({
    lat: cell.lat + sLat * dLat,
    lng: cell.lng + sLng * dLng,
    radius: cell.radius * 0.75,
  }));
}

// A search that comes back with exactly NEARBY_MAX_RESULTS was truncated: the
// cap hid everything past its closest 20, so that cell is split into four
// smaller ones and each gets its own 20. Repeat until cells answer under the
// cap (nothing left hidden) or the call budget runs out.
//
// The fixed four-direction ring this replaces missed shops that were plainly
// on the map: ข้าวแกงครัวคุณยาย, 655 m from มทส. ประตู 1, landed in only one
// of five searches, so a few metres' difference in where the user stood lost
// it. Aiming a search straight at it didn't help either — around there even a
// cell centred on the shop's own bearing fills its 20 with something nearer.
// Density, not direction, is what hides shops, and only splitting until the
// cap stops biting answers that.
//
// Cells are taken nearest-first so a budget that runs out in a dense market
// leaves the far edge of the radius thin rather than the shops next to the
// user — the ones "there's a pin right there and it didn't show" is about.
export async function fetchNearby(lat, lng) {
  const radius = getRadius();
  const found = new Map();
  const queue = [{ lat, lng, radius, distance: 0 }];
  let calls = 0;

  while (queue.length && calls < MAX_SEARCH_CALLS) {
    queue.sort((a, b) => a.distance - b.distance);
    const batch = queue.splice(0, Math.min(SEARCH_BATCH_SIZE, MAX_SEARCH_CALLS - calls));
    calls += batch.length;
    const results = await Promise.all(batch.map(cell =>
      searchNearby(cell.lat, cell.lng, cell.radius).catch(err => {
        console.warn('[HEWKAO] nearby search failed:', err);
        return [];
      })
    ));

    results.forEach((places, i) => {
      for (const p of places) {
        if (!p.location || found.has(p.id)) continue;
        // Cells centred away from the user can reach past the chosen radius.
        if (haversine(lat, lng, p.location.latitude, p.location.longitude) > radius) continue;
        found.set(p.id, p);
      }
      const cell = batch[i];
      if (places.length < NEARBY_MAX_RESULTS || cell.radius <= MIN_CELL_RADIUS_M) return;
      for (const child of subdivide(cell)) {
        child.distance = haversine(lat, lng, child.lat, child.lng);
        if (child.distance - child.radius <= radius) queue.push(child);
      }
    });
  }
  return [...found.values()];
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
