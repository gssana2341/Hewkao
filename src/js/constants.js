/* ---------- Categories ---------- */
const ICON_THAI = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 11.5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1c0 4.7-4 8.5-9 8.5s-9-3.8-9-8.5z" fill="currentColor"/><path d="M9 4c-1.3 1-1.3 2 0 3M13 4c-1.3 1-1.3 2 0 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
const ICON_JAPANESE = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const ICON_KOREAN = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="11" width="16" height="8" rx="3" fill="currentColor"/><rect x="1.3" y="10.2" width="3.2" height="2.4" rx="1.2" fill="currentColor"/><rect x="19.5" y="10.2" width="3.2" height="2.4" rx="1.2" fill="currentColor"/><path d="M9.5 4c-1.2 1-1.2 2 0 3M14.5 4c-1.2 1-1.2 2 0 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
const ICON_CHINESE = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 8 7.5 4h9L19 8z" fill="currentColor"/><rect x="5" y="8" width="14" height="11" rx="1.2" fill="currentColor"/><path d="M9.5 4V2.7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
const ICON_WESTERN = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="6.3" y="9" width="1.4" height="13" rx="0.7" fill="currentColor"/><rect x="4.3" y="2" width="1.1" height="6" rx="0.5" fill="currentColor"/><rect x="6.45" y="2" width="1.1" height="6" rx="0.5" fill="currentColor"/><rect x="8.6" y="2" width="1.1" height="6" rx="0.5" fill="currentColor"/><path d="M4.3 8v1.5a3 3 0 0 0 3 3 3 3 0 0 0 3-3V8" fill="currentColor"/><path d="M16.5 2c2 0 3.2 2.3 3.2 5 0 2.3-1 4.4-2.5 5.1L17.7 22h-1.9l-.5-9.9c-1.3-.8-2.1-2.7-2.1-5 0-2.7 1.1-5 3.3-5z" fill="currentColor"/></svg>';
const ICON_SEAFOOD = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 12c3-4.5 8.5-6.5 13-4-1.2 2.2-1.2 5.8 0 8-4.5 2.5-10 .5-13-4z" fill="currentColor"/><path d="M16 8.5l4.5-2.5v12l-4.5-2.5z" fill="currentColor"/></svg>';
const ICON_FASTFOOD = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9.5a8 8 0 0 1 16 0z" fill="currentColor"/><rect x="3.3" y="10.8" width="17.4" height="2.3" rx="1.15" fill="currentColor"/><rect x="3.3" y="15.2" width="17.4" height="3.2" rx="1.6" fill="currentColor"/></svg>';
const ICON_CAFE = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 9h12v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M17 10.5h1.4a2.5 2.5 0 0 1 0 5H17" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 3c-1.2 1-1.2 2 0 3M13 3c-1.2 1-1.2 2 0 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
const ICON_OTHER = '<svg viewBox="0 0 24 24" width="18" height="18"><ellipse cx="7" cy="4.3" rx="2.3" ry="3.1" fill="currentColor"/><rect x="6.3" y="7" width="1.4" height="15" rx="0.7" fill="currentColor"/><rect x="15.3" y="9" width="1.4" height="13" rx="0.7" fill="currentColor"/><rect x="13.3" y="2" width="1.1" height="6" rx="0.5" fill="currentColor"/><rect x="15.45" y="2" width="1.1" height="6" rx="0.5" fill="currentColor"/><rect x="17.6" y="2" width="1.1" height="6" rx="0.5" fill="currentColor"/><path d="M13.3 8v1.5a3 3 0 0 0 3 3 3 3 0 0 0 3-3V8" fill="currentColor"/></svg>';

export const CATS = [
  { id:'thai',     label:'อาหารไทย',      icon:ICON_THAI,     color:'#ff5a36' },
  { id:'japanese', label:'ญี่ปุ่น',        icon:ICON_JAPANESE, color:'#e11d48' },
  { id:'korean',   label:'เกาหลี',        icon:ICON_KOREAN,   color:'#db2777' },
  { id:'chinese',  label:'จีน',           icon:ICON_CHINESE,  color:'#eab308' },
  { id:'western',  label:'ตะวันตก',       icon:ICON_WESTERN,  color:'#8b5cf6' },
  { id:'seafood',  label:'อาหารทะเล',     icon:ICON_SEAFOOD,  color:'#0284c7' },
  { id:'fastfood', label:'ฟาสต์ฟู้ด',     icon:ICON_FASTFOOD, color:'#f59e0b' },
  { id:'cafe',     label:'คาเฟ่/ของหวาน', icon:ICON_CAFE,     color:'#92400e' },
  { id:'other',    label:'อาหารทั่วไป',   icon:ICON_OTHER,    color:'#a16207' },
];
export const CAT_BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));
export function catOf(r) { return CAT_BY_ID[r.category] || CAT_BY_ID.other; }

export const FALLBACK_LATLNG = [13.7563, 100.5018]; // Bangkok
export const DISLIKE_KEY = 'hewkao_disliked_categories';
export const RADIUS_KEY = 'hewkao_search_radius';
export const OPEN_NOW_KEY = 'hewkao_open_now_only';
export const LIST_COLLAPSED_KEY = 'hewkao_list_collapsed';
export const RADIUS_OPTIONS = [1000, 2000, 3000, 5000];
export const RADIUS_LABELS = { 1000: '1 กม.', 2000: '2 กม.', 3000: '3 กม.', 5000: '5 กม.' };
export const DEFAULT_RADIUS = 3000;
export const GOOGLE_MAP_ID = 'b1db59f4d928f84d6e05120c';
export const PRICE_LABEL = {
  PRICE_LEVEL_FREE: 'ฟรี',
  PRICE_LEVEL_INEXPENSIVE: '฿',
  PRICE_LEVEL_MODERATE: '฿฿',
  PRICE_LEVEL_EXPENSIVE: '฿฿฿',
  PRICE_LEVEL_VERY_EXPENSIVE: '฿฿฿฿',
};

// Prototype only: "ไปเอง" works for every result (it's just directions).
// The delivery options are gated on Google's `delivery` flag and open a
// search deep-link rather than a real merchant-matched page — LINE MAN and
// ShopeeFood don't expose a Place ID → merchant ID mapping, so an exact
// deep link needs real API research before this ships for real.
export const GO_METHODS = [
  { id: 'self',        label: 'ไปเอง',       icon: 'assets/icon-self.jpg' },
  { id: 'lineman',     label: 'LINE MAN',    icon: 'assets/icon-lineman.png' },
  { id: 'shopeefood',  label: 'ShopeeFood',  icon: 'assets/icon-shopeefood.jpg' },
];
