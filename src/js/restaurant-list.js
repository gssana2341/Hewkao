import { state } from './state.js';
import { catOf, LIST_COLLAPSED_KEY, SHOW_LIST_PHOTOS } from './constants.js';
import { escapeHTML, formatDistance, starRow } from './utils.js';
import { getDislikedSet, getOpenNowOnly } from './preferences.js';
import { fetchNearby, processResults, getPhotoUri } from './places-api.js';
import { renderMarkers } from './map.js';
import { showResult } from './spin-result.js';

const listPanel = document.getElementById('listPanel');
const listHandle = document.getElementById('listHandle');
const listToggleBtn = document.getElementById('listToggleBtn');
const listCountEl = document.getElementById('listCount');
const listEl = document.getElementById('restaurantList');
const appEl = document.getElementById('app');
const spinBtn = document.getElementById('spinBtn');

export function setListLoading() {
  listCountEl.textContent = 'กำลังค้นหา…';
  listEl.innerHTML = '<div class="list-loading">กำลังค้นหาร้านอาหารใกล้คุณ…</div>';
}

export function showListEmpty(msg, { retry = false } = {}) {
  listCountEl.textContent = '0 ร้าน';
  listEl.innerHTML = `<div class="list-empty">
      <p>${escapeHTML(msg)}</p>
      ${retry ? '<button type="button" class="btn btn-secondary list-retry-btn">ลองอีกครั้ง</button>' : ''}
    </div>`;
  listEl.querySelector('.list-retry-btn')?.addEventListener('click', loadNearby);
}

// Richer card for the persistent restaurant list, modeled closely on Google Maps'
// own search-result rows — star rating, category, open/closed + price, all
// visible at a glance (no need to tap in). The media slot starts as the
// category icon and swaps to the shop's photo once it scrolls into view.
export function restaurantCardHTML(r) {
  const cat = catOf(r);

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

  return `
    <div class="card-body">
      <div class="card-name">${escapeHTML(r.name)}</div>
      ${ratingLine}
      <div class="card-meta card-meta-sub">${cat.label}</div>
      <div class="card-meta card-meta-sub">${statusHTML}${formatDistance(r.distance)}${priceBit}</div>
    </div>
    <div class="card-media" data-id="${r.id}">
      <div class="card-emoji" style="--cat:${cat.color}">${cat.icon}</div>
    </div>`;
}

/* ---------- Lazy list photos ---------- */
// Google requires the photographer's credit wherever a Places photo appears,
// thumbnails included.
function photoCreditEl(r) {
  const el = document.createElement('span');
  el.className = 'card-photo-credit';
  el.textContent = r.photoAuthor ? `รูป: ${r.photoAuthor}` : '';
  return el;
}

function loadThumb(mediaEl) {
  const r = state.restaurants.find(x => x.id === mediaEl.dataset.id);
  if (!r?.photoName) return;
  getPhotoUri(r).then(uri => {
    if (!uri || !mediaEl.isConnected) return;
    const img = new Image();
    img.className = 'card-photo';
    img.alt = '';
    // Swap only once decoded, so the icon never flashes to an empty box.
    img.onload = () => mediaEl.replaceChildren(img, photoCreditEl(r));
    img.src = uri;
  });
}

// Photos load only for cards that actually come into view: every photo is a
// billed request, and a phone's collapsed sheet shows barely one card while a
// search can return 40 shops.
const thumbObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        thumbObserver.unobserve(entry.target);
        loadThumb(entry.target);
      });
    }, { rootMargin: '0px 0px 200px 0px' })
  : null;

function observeThumbs() {
  if (!SHOW_LIST_PHOTOS) return;
  thumbObserver?.disconnect();
  listEl.querySelectorAll('.card-media').forEach(el => {
    if (thumbObserver) thumbObserver.observe(el);
    else loadThumb(el);
  });
}

// Restaurants that match the saved filters — used for the list, the map pins
// and the random pool, so all three always agree on what's in play.
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
  // Low-info shops are sorted last (see processResults); a label where that
  // group starts keeps a nearer shop appearing lower from reading as a bug.
  listEl.innerHTML = visible.map((r, i) => {
    const divider = i > 0 && r.sparse && !visible[i - 1].sparse
      ? '<p class="list-divider">ร้านอื่นๆ ที่ข้อมูลใน Google ยังน้อย</p>'
      : '';
    return `${divider}<button type="button" class="restaurant-card" data-id="${r.id}">${restaurantCardHTML(r)}</button>`;
  }).join('');
  listEl.querySelectorAll('.restaurant-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = state.restaurants.find(x => x.id === btn.dataset.id);
      if (r) showResult(r);
    });
  });
  observeThumbs();
}

export async function loadNearby() {
  setListLoading();
  spinBtn.disabled = true;
  state.recentPickIds = [];
  try {
    const results = await fetchNearby(state.userLatLng[0], state.userLatLng[1]);
    state.restaurants = processResults(results, state.userLatLng);
  } catch (err) {
    console.warn('[HEWKAO] nearby search failed:', err);
    showListEmpty('โหลดร้านอาหารไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', { retry: true });
    return;
  }
  renderList();
  renderMarkers();
  if (!state.restaurants.length) {
    showListEmpty('ไม่พบร้านอาหารในระยะที่ตั้งไว้ ลองเพิ่มระยะค้นหาในการตั้งค่า');
  } else {
    spinBtn.disabled = false;
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

// The resting transform above is a pixel value from the panel's height at the
// time, so rotating the phone or the browser toolbar resizing makes it stale.
window.addEventListener('resize', () => {
  if (dragging || !listPanel.style.transform) return;
  if (!isMobile()) { listPanel.style.transform = ''; return; }
  panelH = listPanel.getBoundingClientRect().height;
  listPanel.style.transform = `translateY(${listPanel.classList.contains('expanded') ? 0 : collapsedTranslate()}px)`;
});

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
