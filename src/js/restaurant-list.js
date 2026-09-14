import { state } from './state.js';
import { catOf } from './constants.js';
import { escapeHTML, formatDistance, showToast, starRow, featureBadge } from './utils.js';
import { getDislikedSet, getOpenNowOnly } from './preferences.js';
import { fetchNearby, processResults } from './places-api.js';
import { renderMarkers } from './map.js';
import { showResult } from './spin-result.js';

const listPanel = document.getElementById('listPanel');
const listHandle = document.getElementById('listHandle');
const listToggleBtn = document.getElementById('listToggleBtn');
const listCountEl = document.getElementById('listCount');
const listEl = document.getElementById('restaurantList');
const appEl = document.getElementById('app');
const LIST_COLLAPSED_KEY = 'hewkao_list_collapsed';

export function setListLoading() {
  listCountEl.textContent = 'กำลังค้นหา…';
  listEl.innerHTML = '<div class="list-loading">กำลังค้นหาร้านอาหารใกล้คุณ…</div>';
}

export function showListEmpty(msg) {
  listCountEl.textContent = '0 ร้าน';
  listEl.innerHTML = `<div class="list-empty">${escapeHTML(msg)}</div>`;
}

// Richer card for the persistent restaurant list, modeled closely on Google Maps'
// own search-result rows — star rating, category, open/closed + price, and
// dine-in/takeout/delivery badges, all visible at a glance (no need to tap in).
export function restaurantCardHTML(r) {
  const cat = catOf(r);
  const thumb = r.thumbUrl
    ? `<img class="card-photo" src="${r.thumbUrl}" alt="" loading="lazy">`
    : `<div class="card-emoji" style="color:${cat.color}">${cat.icon}</div>`;

  const ratingLine = r.rating
    ? `<div class="card-meta">
        <span class="card-rating-num">${r.rating.toFixed(1)}</span>
        <span class="card-stars">${starRow(r.rating)}</span>
        ${r.ratingCount ? `<span class="card-rating-count">(${r.ratingCount.toLocaleString('en-US')})</span>` : ''}
      </div>`
    : '';

  const statusHTML = r.openNow === true
    ? `<span class="card-status card-status-open">เปิดอยู่</span> · `
    : r.openNow === false
      ? `<span class="card-status card-status-closed">ปิดแล้ว</span> · `
      : '';
  const priceBit = r.priceLabel ? ` · ${r.priceLabel}` : '';

  const featuresHTML = [
    featureBadge('นั่งทานที่ร้าน', r.dineIn),
    featureBadge('สั่งกลับบ้าน', r.takeout),
    featureBadge('เดลิเวอรี่', r.delivery),
  ].filter(Boolean).join('');

  return `
    <div class="card-body">
      <div class="card-name">${escapeHTML(r.name)}</div>
      ${ratingLine}
      <div class="card-meta card-meta-sub">${cat.label}</div>
      <div class="card-meta card-meta-sub">${statusHTML}${formatDistance(r.distance)}${priceBit}</div>
      ${featuresHTML ? `<div class="card-features">${featuresHTML}</div>` : ''}
    </div>
    ${thumb}`;
}

// Restaurants that match the saved filters — used for the list and map pins so
// they show exactly what the user asked to see, not just the random-pick pool.
export function getVisibleRestaurants() {
  const disliked = getDislikedSet();
  let list = state.restaurants.filter(r => !disliked.has(r.category));
  if (getOpenNowOnly()) list = list.filter(r => r.openNow !== false);
  return list;
}

export function highlightCard(id) {
  listEl.querySelectorAll('.restaurant-card').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const active = listEl.querySelector(`.restaurant-card[data-id="${id}"]`);
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function renderList() {
  const visible = getVisibleRestaurants();
  if (!visible.length) {
    showListEmpty('ไม่พบร้านที่ตรงกับตัวกรองที่ตั้งไว้ ลองแก้ไขในตั้งค่าการค้นหา');
    return;
  }
  listCountEl.textContent = `${visible.length} ร้าน`;
  listEl.innerHTML = visible.map(r =>
    `<button type="button" class="restaurant-card" data-id="${r.id}">${restaurantCardHTML(r)}</button>`
  ).join('');
  listEl.querySelectorAll('.restaurant-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = state.restaurants.find(x => x.id === btn.dataset.id);
      if (r) showResult(r);
    });
  });
}

const spinBtn = document.getElementById('spinBtn');

export async function loadNearby() {
  setListLoading();
  spinBtn.disabled = true;
  try {
    const results = await fetchNearby(state.userLatLng[0], state.userLatLng[1]);
    state.restaurants = processResults(results, state.userLatLng);
    renderList();
    renderMarkers();
    if (!state.restaurants.length) {
      showListEmpty('ไม่พบร้านอาหารใกล้คุณ ลองรีเฟรชหน้าใหม่อีกครั้ง');
    } else {
      spinBtn.disabled = false;
    }
  } catch (err) {
    showListEmpty('โหลดร้านอาหารไม่สำเร็จ ลองรีเฟรชหน้าใหม่อีกครั้ง');
    showToast('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
}

/* ---------- Mobile list-panel drag ---------- */
function isMobile() { return window.matchMedia('(max-width:899.9px)').matches; }

let dragging = false, dragStartY = 0, dragStartTranslate = 0, panelH = 0;

function collapsedTranslate() { return panelH - 132; }
function setDragTranslate(px) {
  px = Math.max(0, Math.min(collapsedTranslate(), px));
  listPanel.style.transform = `translateY(${px}px)`;
}
listHandle.addEventListener('pointerdown', e => {
  if (!isMobile()) return;
  dragging = true;
  panelH = listPanel.getBoundingClientRect().height;
  dragStartY = e.clientY;
  dragStartTranslate = listPanel.classList.contains('expanded') ? 0 : collapsedTranslate();
  listPanel.classList.add('dragging');
  listHandle.setPointerCapture(e.pointerId);
});
listHandle.addEventListener('pointermove', e => {
  if (!dragging) return;
  setDragTranslate(dragStartTranslate + (e.clientY - dragStartY));
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  const delta = e.clientY - dragStartY;
  const finalTranslate = Math.max(0, Math.min(collapsedTranslate(), dragStartTranslate + delta));
  // A plain tap (barely any movement) just flips the current state — the
  // halfway-point threshold below only makes sense for an actual drag, and
  // requiring a drag past 50% of the panel height for a tap felt broken.
  const expand = Math.abs(delta) < 8
    ? !listPanel.classList.contains('expanded')
    : finalTranslate < collapsedTranslate() * 0.5;
  listPanel.classList.toggle('expanded', expand);
  listPanel.classList.remove('dragging');
  // Set the resting position explicitly instead of clearing to the class-based
  // rule — on some browsers the class swap alone left the panel visually stuck
  // at its last dragged offset instead of animating to fully open/closed.
  listPanel.style.transform = `translateY(${expand ? 0 : collapsedTranslate()}px)`;
}
listHandle.addEventListener('pointerup', endDrag);
listHandle.addEventListener('pointercancel', endDrag);

/* ---------- Sidebar collapse (desktop, full-screen map) ---------- */
export function setListCollapsed(collapsed) {
  // Clear any inline transform left behind by the mobile drag-sheet logic —
  // it has higher specificity than the desktop .list-collapsed CSS rule and
  // was silently overriding it, making the collapse look like a no-op.
  listPanel.style.transform = '';
  appEl.classList.toggle('list-collapsed', collapsed);
  listToggleBtn.setAttribute('aria-label', collapsed ? 'แสดงรายการร้าน' : 'ซ่อนรายการร้าน');
  localStorage.setItem(LIST_COLLAPSED_KEY, collapsed ? '1' : '0');
  if (state.map) {
    const center = state.map.getCenter();
    setTimeout(() => {
      google.maps.event.trigger(state.map, 'resize');
      if (center) state.map.setCenter(center);
    }, 320);
  }
}
listToggleBtn.addEventListener('click', () => {
  setListCollapsed(!appEl.classList.contains('list-collapsed'));
});
if (localStorage.getItem(LIST_COLLAPSED_KEY) === '1') {
  appEl.classList.add('list-collapsed');
  listToggleBtn.setAttribute('aria-label', 'แสดงรายการร้าน');
}
