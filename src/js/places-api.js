import { PRICE_LABEL } from './constants.js';
import { haversine } from './utils.js';
import { getRadius } from './preferences.js';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const PLACES_INCLUDED_TYPES = ['restaurant', 'cafe', 'bakery', 'fast_food_restaurant', 'meal_takeaway'];
// Hotels get tagged with a generic 'restaurant' type too (for their in-house
// dining), so without this a search near any hotel-dense area comes back
// half full of hotels instead of standalone restaurants/chains — confirmed
// by testing near Siam, Bangkok: 10 of the top 20 results were hotels.
const PLACES_EXCLUDED_PRIMARY_TYPES = [
  'lodging', 'hotel', 'motel', 'resort_hotel', 'extended_stay_hotel',
  'bed_and_breakfast', 'guest_house', 'hostel', 'inn',
];
const PLACES_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.location', 'places.types',
  'places.formattedAddress', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.priceLevel', 'places.rating', 'places.userRatingCount', 'places.photos',
  'places.reviews', 'places.currentOpeningHours.openNow',
  'places.dineIn', 'places.takeout', 'places.delivery',
].join(',');

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

export function photoUrl(photoName, maxWidthPx) {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${GOOGLE_API_KEY}`;
}

export async function fetchNearby(lat, lng) {
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
      maxResultCount: 20,
      languageCode: 'th',
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: getRadius() },
      },
    }),
  });
  if (!res.ok) throw new Error('nearby error ' + res.status);
  const data = await res.json();
  return data.places || [];
}

export function processResults(places, [uLat, uLng]) {
  const list = places
    .filter(p => p.displayName?.text && p.location)
    .map(p => ({
      id: p.id,
      name: p.displayName.text,
      lat: p.location.latitude,
      lng: p.location.longitude,
      category: mapGoogleCategory(p.types, p.displayName?.text),
      address: p.formattedAddress || '',
      tel: p.internationalPhoneNumber || '',
      website: p.websiteUri || '',
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? 0,
      priceLabel: PRICE_LABEL[p.priceLevel] || '',
      thumbUrl: p.photos?.[0] ? photoUrl(p.photos[0].name, 160) : '',
      photoUrl: p.photos?.[0] ? photoUrl(p.photos[0].name, 640) : '',
      openNow: p.currentOpeningHours?.openNow ?? null,
      dineIn: p.dineIn ?? null,
      takeout: p.takeout ?? null,
      delivery: p.delivery ?? null,
      reviews: (p.reviews || []).slice(0, 3).map(rv => ({
        author: rv.authorAttribution?.displayName || 'ผู้ใช้ Google',
        rating: rv.rating || 0,
        text: rv.text?.text || '',
      })),
      distance: haversine(uLat, uLng, p.location.latitude, p.location.longitude),
    }));
  list.sort((a, b) => a.distance - b.distance);
  return list;
}
