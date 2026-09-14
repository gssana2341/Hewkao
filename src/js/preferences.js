import { CATS, DISLIKE_KEY, RADIUS_KEY, OPEN_NOW_KEY, RADIUS_OPTIONS, RADIUS_LABELS, DEFAULT_RADIUS } from './constants.js';
import { state } from './state.js';
import { showToast } from './utils.js';
import { loadNearby, renderList } from './restaurant-list.js';
import { renderMarkers } from './map.js';

const prefsBtn = document.getElementById('prefsBtn');
const prefsModal = document.getElementById('prefsModal');
const radiusChipsEl = document.getElementById('radiusChips');
const openNowChipsEl = document.getElementById('openNowChips');
const prefsChipsEl = document.getElementById('prefsChips');
const prefsClose = document.getElementById('prefsClose');
const prefsSave = document.getElementById('prefsSave');

export function getDislikedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(DISLIKE_KEY) || '[]')); }
  catch { return new Set(); }
}
export function setDislikedSet(set) {
  localStorage.setItem(DISLIKE_KEY, JSON.stringify([...set]));
}
export function getRadius() {
  const v = parseInt(localStorage.getItem(RADIUS_KEY), 10);
  return RADIUS_OPTIONS.includes(v) ? v : DEFAULT_RADIUS;
}
export function setRadius(v) { localStorage.setItem(RADIUS_KEY, String(v)); }
export function getOpenNowOnly() { return localStorage.getItem(OPEN_NOW_KEY) === '1'; }
export function setOpenNowOnly(v) { localStorage.setItem(OPEN_NOW_KEY, v ? '1' : '0'); }

function renderChips() {
  prefsChipsEl.innerHTML = CATS.filter(c => c.id !== 'other').map(c =>
    `<button type="button" class="chip ${state.tempDisliked.has(c.id) ? 'selected' : ''}" data-id="${c.id}">${c.icon} ${c.label}</button>`
  ).join('');
  prefsChipsEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      if (state.tempDisliked.has(id)) state.tempDisliked.delete(id); else state.tempDisliked.add(id);
      chip.classList.toggle('selected');
    });
  });
}
function renderRadiusChips() {
  radiusChipsEl.innerHTML = RADIUS_OPTIONS.map(m =>
    `<button type="button" class="chip ${state.tempRadius === m ? 'selected' : ''}" data-radius="${m}">${RADIUS_LABELS[m]}</button>`
  ).join('');
  radiusChipsEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.tempRadius = parseInt(chip.dataset.radius, 10);
      renderRadiusChips();
    });
  });
}
function renderOpenNowChip() {
  openNowChipsEl.innerHTML = `<button type="button" class="chip ${state.tempOpenNowOnly ? 'selected' : ''}">🕐 เฉพาะร้านที่เปิดอยู่ตอนนี้</button>`;
  openNowChipsEl.querySelector('.chip').addEventListener('click', () => {
    state.tempOpenNowOnly = !state.tempOpenNowOnly;
    renderOpenNowChip();
  });
}

export function openPrefs() {
  state.tempDisliked = getDislikedSet();
  state.tempRadius = getRadius();
  state.tempOpenNowOnly = getOpenNowOnly();
  renderChips();
  renderRadiusChips();
  renderOpenNowChip();
  prefsModal.hidden = false;
}
export function closePrefs() { prefsModal.hidden = true; }

function savePrefs() {
  setDislikedSet(state.tempDisliked);
  const radiusChanged = state.tempRadius !== getRadius();
  setRadius(state.tempRadius);
  setOpenNowOnly(state.tempOpenNowOnly);
  closePrefs();
  showToast('บันทึกการตั้งค่าแล้ว');
  if (radiusChanged) {
    loadNearby();
  } else {
    // Radius unchanged — just re-filter the restaurants already loaded,
    // no need to hit the API again.
    renderList();
    renderMarkers();
  }
}

prefsBtn.addEventListener('click', openPrefs);
prefsClose.addEventListener('click', closePrefs);
prefsModal.addEventListener('click', e => { if (e.target === prefsModal) closePrefs(); });
prefsSave.addEventListener('click', savePrefs);
