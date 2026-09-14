const toastEl = document.getElementById('toast');
let toastTimer = null;

export function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} ม.`;
  return `${(m / 1000).toFixed(1)} กม.`;
}

export function formatDuration(sec) {
  const min = Math.round(sec / 60);
  if (min < 1) return 'น้อยกว่า 1 นาที';
  if (min < 60) return `${min} นาที`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.style.animation = 'none';
  void toastEl.offsetHeight;
  toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
}

export function starRow(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function featureBadge(label, val) {
  if (val == null) return '';
  return `<span class="feature-badge ${val ? 'feature-yes' : 'feature-no'}">${val ? '✓' : '✕'} ${label}</span>`;
}
