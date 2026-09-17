import { state } from './state.js';
import { catOf, LIST_COLLAPSED_KEY, SHOW_LIST_PHOTOS, CONTEXT_MODES, CONTEXT_MODE_BY_ID } from './constants.js';
import { escapeHTML, formatDistance, starRow } from './utils.js';
import { getDislikedSet, getOpenNowOnly, getContextMode, setContextMode } from './preferences.js';
import { fetchNearby, processResults, getPhotoUri } from './places-api.js';
import { isPopular, loadPopularity } from './popularity.js';
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
  // Sibling of .card-media, not inside it — loadThumb() below replaces that
  // element's children wholesale when the photo arrives, which would delete
  // a badge placed inside it.
  const fireBadge = isPopular(r.id) ? '<span class="card-fire-badge" title="ร้านที่คนไปเยอะ (จากสถิติของเรา)">🔥</span>' : '';

  return `
    <div class="card-body">
      <div class="card-name">${escapeHTML(r.name)}</div>
      ${ratingLine}
      <div class="card-meta card-meta-sub">${cat.label}</div>
      <div class="card-meta card-meta-sub">${statusHTML}${formatDistance(r.distance)}${priceBit}</div>
    </div>
    <div class="card-media" data-id="${r.id}">
      <div class="card-emoji" style="--cat:${cat.color}">${cat.icon}</div>
    </div>
    ${fireBadge}`;
}

/* ---------- Lazy list photos ---------- */
// No credit caption on this thumbnail: Google's Places API photo policy
// explicitly allows omitting author attribution "if space is limited (such as
// in a gallery or for thumbnails)... provided the user is able to access a
// larger version of the image that includes the full author attribution."
// Tapping a card opens the result sheet, whose bigger photo does show it
// (renderPhoto() in spin-result.js) — so that condition is already met.
function loadThumb(mediaEl) {
  const r = state.restaurants.find(x => x.id === mediaEl.dataset.id);
  if (!r?.photoName) return;
  getPhotoUri(r).then(uri => {
    if (!uri || !mediaEl.isConnected) return;
    const img = new Image();
    img.className = 'card-photo';
    img.alt = '';
    // Swap only once decoded, so the icon never flashes to an empty box.
    img.onload = () => mediaEl.replaceChildren(img);
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
  const mode = CONTEXT_MODE_BY_ID[getContextMode()];
  if (mode?.match) list = list.filter(mode.match);
  return list;
}

/* ---------- Context mode chips (ทั้งหมด / ครอบครัว / แฟน / เพื่อน) ---------- */
const modeChipsEl = document.getElementById('modeChips');
const modeHintEl = document.getElementById('modeHint');

const MODE_ICON_PATHS = {
  all: '<path d="M7 2v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2M9 11v11M17 2c-1.7 0-3 1.8-3 4v4.5c0 1 .7 1.5 1.7 1.5H17M17 2v19"/>',
  family: '<circle cx="9" cy="7" r="2.4"/><circle cx="16" cy="8.3" r="2"/><path d="M4 20c.5-3.1 2.2-5.2 5-5.2s4.5 2.1 5 5.2M14.2 20c.4-2.4 1.6-4.1 3.8-4.3"/>',
  date: '<path d="M12 20s-7-4.4-9.3-8.8C1.3 8 2.7 5 6 5c2 0 3.3 1 4 2.3C10.7 6 12 5 14 5c3.3 0 4.7 3 3.3 6.2C15 15.6 12 20 12 20z"/>',
  friends: '<circle cx="8" cy="8" r="2.3"/><circle cx="16" cy="8" r="2.3"/><path d="M3 20c.4-2.8 2-4.8 5-4.8s4.6 2 5 4.8M11 20c.4-2.8 2-4.8 5-4.8s4.6 2 5 4.8"/>',
};

function renderModeChips() {
  const current = getContextMode();
  modeChipsEl.innerHTML = CONTEXT_MODES.map(m =>
    `<button type="button" class="chip ${current === m.id ? 'selected' : ''}" data-mode="${m.id}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MODE_ICON_PATHS[m.id] || ''}</svg>
      ${escapeHTML(m.label)}
    </button>`
  ).join('');
  modeHintEl.textContent = CONTEXT_MODE_BY_ID[current]?.hint || '';
  modeChipsEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.mode === current) return;
      setContextMode(chip.dataset.mode);
      renderModeChips();
      renderList();
      renderMarkers();
    });
  });
}
renderModeChips();

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
  // Fire badges never block the first paint — they're a Firestore round trip
  // on top of a list that's often already 100+ shops, so they arrive after
  // and re-render just the list once ready. The badge is list-only (map pins
  // don't show it), so there's nothing on the map to redraw here.
  loadPopularity(state.restaurants.map(r => r.id)).then(renderList);
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
// keepCenter re-centres the map once the panel has finished animating, so the
// view doesn't drift as the map's width changes. Callers that are about to
// aim the camera themselves pass false: the re-centre lands ~320 ms later and
// would otherwise undo whatever they just framed (it was quietly cancelling
// the route preview's fitBounds).
// Desktop collapses a sidebar (.list-collapsed on #app); mobile drags a
// bottom sheet (.expanded on the panel itself, plus an explicit inline
// transform — see the drag handlers above). They're unrelated mechanisms, so
// whether the list is "in the way" of the map has to be read from whichever
// one actually applies at the current width.
export function isListCollapsed() {
  return isMobile() ? !listPanel.classList.contains('expanded') : appEl.classList.contains('list-collapsed');
}

// persist:false is for callers that move the panel temporarily — the route
// preview tucks it away while a route is on screen, and that is not the user
// choosing to keep the list closed. Without this, closing the tab mid-preview
// left the list collapsed on the next visit. persist only ever applied to the
// desktop mechanism anyway (mobile's sheet position was never saved).
export function setListCollapsed(collapsed, { keepCenter = true, persist = true } = {}) {
  if (isMobile()) {
    // Route-preview.js used to call this on mobile expecting it to hide the
    // sheet — it only ever touched the desktop class below, so the sheet
    // stayed exactly where the user's last drag left it (often full-open),
    // overlapping the map controls. This mirrors what endDrag() itself does.
    panelH = listPanel.getBoundingClientRect().height;
    listPanel.classList.remove('dragging');
    listPanel.classList.toggle('expanded', !collapsed);
    listPanel.style.transform = `translateY(${collapsed ? collapsedTranslate() : 0}px)`;
  } else {
    // Clear any inline transform left behind by the mobile drag-sheet logic —
    // it has higher specificity than the desktop .list-collapsed CSS rule and
    // was silently overriding it, making the collapse look like a no-op.
    listPanel.style.transform = '';
    appEl.classList.toggle('list-collapsed', collapsed);
    listToggleBtn.setAttribute('aria-label', collapsed ? 'แสดงรายการร้าน' : 'ซ่อนรายการร้าน');
    if (persist) localStorage.setItem(LIST_COLLAPSED_KEY, collapsed ? '1' : '0');
  }
  if (state.map) {
    // The centre is only snapshotted when the caller wants the view held;
    // otherwise whatever it is when the timer fires gets re-applied. Calling
    // setCenter at all is not optional either way — the resize trigger on its
    // own leaves the map painted blank (line and markers still draw, no
    // tiles) until something nudges it to redraw.
    const held = keepCenter ? state.map.getCenter() : null;
    setTimeout(() => {
      google.maps.event.trigger(state.map, 'resize');
      state.map.setCenter(held ?? state.map.getCenter());
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
