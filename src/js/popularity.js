import { doc, setDoc, increment, collection, query, where, documentId, getDocs } from 'firebase/firestore';
import { db } from './firebase.js';

/* =========================================================================
   HEWKAO — "picked a lot" fire badge, from our own usage, not Google's rating.

   A pick is counted only at real intent to go, not a spin landing on a shop
   mid-animation: showing a route ("ไปเอง" in route-preview.js) or handing off
   to a delivery app (spin-result.js). One shared counter per place_id across
   every visitor, in Firestore's place_picks collection.
   ========================================================================= */

// Tunable: how many recorded picks before a shop's card lights up. Kept low
// on purpose — usage volume is small pre-launch, and a threshold that only
// ever fires at scale would make the feature invisible for months.
const FIRE_THRESHOLD = 3;
// Firestore's `in` operator accepts at most 30 values per query, so a pool
// bigger than that (a dense area easily returns 100+) is read in batches.
const IN_QUERY_CHUNK = 30;

let popularIds = new Set();

export function isPopular(id) {
  return popularIds.has(id);
}

export function recordPick(placeId) {
  if (!db || !placeId) return;
  setDoc(doc(db, 'place_picks', placeId), { count: increment(1) }, { merge: true })
    .catch(err => console.error('[HEWKAO] pick tracking failed:', err));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Refreshes the popular-ids set for the given pool and returns it. Callers
// re-render once this resolves — it's never awaited before the list's first
// paint, so a slow or failed fetch only means badges arrive a moment late,
// not a blocked list.
export async function loadPopularity(placeIds) {
  if (!db || !placeIds.length) { popularIds = new Set(); return popularIds; }
  const results = await Promise.all(chunk(placeIds, IN_QUERY_CHUNK).map(async ids => {
    try {
      const snap = await getDocs(query(collection(db, 'place_picks'), where(documentId(), 'in', ids)));
      return snap.docs.filter(d => (d.data().count || 0) >= FIRE_THRESHOLD).map(d => d.id);
    } catch (err) {
      console.error('[HEWKAO] popularity fetch failed:', err);
      return [];
    }
  }));
  popularIds = new Set(results.flat());
  return popularIds;
}
